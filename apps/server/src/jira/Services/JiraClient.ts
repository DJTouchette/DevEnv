/**
 * JiraClient - Effect service for Jira Cloud REST API operations.
 *
 * Loads credentials from {@link JiraCredentials}, builds either a Basic
 * (email + API token) or Bearer (API key / OAuth) `Authorization` header, and
 * exposes search / read / write methods used by the WS RPC layer. Maps HTTP
 * status codes to typed errors and retries `429` responses with exponential
 * backoff.
 *
 * @module JiraClient
 */
import {
  type JiraComment,
  JiraConfigError,
  type JiraCredentials,
  JiraDecodeError,
  type JiraIssue,
  type JiraIssueCreateInput,
  type JiraIssueKey,
  JiraIssueKey as JiraIssueKeySchema,
  JiraNotFoundError,
  JiraNetworkError,
  JiraRateLimitedError,
  type JiraSearchInput,
  type JiraSearchPage,
  type JiraTransition,
  type JiraUser,
  JiraAuthError,
} from "@t3tools/contracts";
import { Context, Duration, Effect, Layer, Option, Schedule } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { JiraCredentials as JiraCredentialsService } from "./JiraCredentials.ts";

export type JiraReadError =
  | JiraConfigError
  | JiraAuthError
  | JiraNotFoundError
  | JiraRateLimitedError
  | JiraNetworkError
  | JiraDecodeError;

export interface JiraClientShape {
  readonly currentUser: Effect.Effect<JiraUser, JiraReadError>;
  readonly search: (input: JiraSearchInput) => Effect.Effect<JiraSearchPage, JiraReadError>;
  readonly getIssue: (input: { readonly issueKey: JiraIssueKey }) => Effect.Effect<JiraIssue, JiraReadError>;
  readonly createIssue: (input: JiraIssueCreateInput) => Effect.Effect<JiraIssue, JiraReadError>;
  readonly listTransitions: (input: {
    readonly issueKey: JiraIssueKey;
  }) => Effect.Effect<ReadonlyArray<JiraTransition>, JiraReadError>;
  readonly transitionIssue: (input: {
    readonly issueKey: JiraIssueKey;
    readonly transitionId: string;
  }) => Effect.Effect<void, JiraReadError>;
  readonly addComment: (input: {
    readonly issueKey: JiraIssueKey;
    readonly body: string;
  }) => Effect.Effect<JiraComment, JiraReadError>;
  readonly listComments: (input: {
    readonly issueKey: JiraIssueKey;
    readonly maxResults?: number;
  }) => Effect.Effect<ReadonlyArray<JiraComment>, JiraReadError>;
}

export class JiraClient extends Context.Service<JiraClient, JiraClientShape>()(
  "t3/jira/Services/JiraClient",
) {}

const buildAuthHeader = (creds: JiraCredentials): string => {
  if (creds.kind === "basic") {
    const token = Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64");
    return `Basic ${token}`;
  }
  return `Bearer ${creds.apiKey}`;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const issueBrowseUrl = (baseUrl: string, key: string): string =>
  `${trimTrailingSlash(baseUrl)}/browse/${key}`;

const adaptUser = (raw: any): JiraUser | undefined => {
  if (!raw || typeof raw.accountId !== "string") return undefined;
  return {
    accountId: raw.accountId,
    displayName: typeof raw.displayName === "string" ? raw.displayName : raw.accountId,
    ...(typeof raw.emailAddress === "string" ? { emailAddress: raw.emailAddress } : {}),
  };
};

const adaptStatus = (raw: any) => {
  if (!raw || typeof raw.id !== "string") return undefined;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    ...(typeof raw.statusCategory?.name === "string"
      ? { category: raw.statusCategory.name as string }
      : {}),
  };
};

const adfToText = (node: any): string => {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  const inner = Array.isArray(node.content) ? node.content.map(adfToText).join("") : "";
  if (
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "listItem" ||
    node.type === "blockquote"
  ) {
    return `${inner}\n`;
  }
  return inner;
};

const adaptDescription = (raw: unknown): string | undefined => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string") return raw.length > 0 ? raw : undefined;
  if (typeof raw === "object") {
    const text = adfToText(raw).trim();
    return text.length > 0 ? text : undefined;
  }
  return undefined;
};

const adaptIssue = (baseUrl: string, raw: any): JiraIssue | null => {
  if (!raw || typeof raw.key !== "string") return null;
  const fields = raw.fields ?? {};
  const status = adaptStatus(fields.status);
  const description = adaptDescription(fields.description);
  return {
    key: JiraIssueKeySchema.make(raw.key),
    summary: typeof fields.summary === "string" ? fields.summary : "",
    ...(status ? { status } : {}),
    ...(fields.assignee !== undefined
      ? { assignee: adaptUser(fields.assignee) ?? null }
      : {}),
    ...(fields.reporter !== undefined
      ? { reporter: adaptUser(fields.reporter) ?? null }
      : {}),
    url: issueBrowseUrl(baseUrl, raw.key),
    ...(typeof fields.updated === "string" ? { updated: fields.updated } : {}),
    ...(description !== undefined ? { description } : {}),
  };
};

export const makeJiraClient = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const credentials = yield* JiraCredentialsService;

  const requireCreds = credentials.get.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new JiraConfigError({
              detail: "No Jira credentials configured. Set them via the credentials dialog.",
            }),
          ),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
    Effect.catchTag("JiraStorageError", (cause) =>
      Effect.fail(
        new JiraConfigError({
          detail: cause.detail,
        }),
      ),
    ),
  );

  const buildRequest = (
    method: "GET" | "POST",
    pathSegment: string,
    body?: unknown,
  ): Effect.Effect<
    { readonly request: HttpClientRequest.HttpClientRequest; readonly baseUrl: string },
    JiraReadError
  > =>
    Effect.gen(function* () {
      const creds = yield* requireCreds;
      const baseUrl = trimTrailingSlash(creds.baseUrl);
      const url = `${baseUrl}${pathSegment.startsWith("/") ? pathSegment : `/${pathSegment}`}`;
      const headers: Record<string, string> = {
        Authorization: buildAuthHeader(creds),
        Accept: "application/json",
        "X-Atlassian-Token": "no-check",
      };
      const baseRequest =
        method === "GET" ? HttpClientRequest.get(url) : HttpClientRequest.post(url);
      const withHeaders = baseRequest.pipe(HttpClientRequest.setHeaders(headers));
      if (body === undefined) {
        return { request: withHeaders, baseUrl: creds.baseUrl };
      }
      const withBody = yield* HttpClientRequest.bodyJson(body)(withHeaders).pipe(
        Effect.mapError(
          (cause) =>
            new JiraNetworkError({
              detail: "Failed to encode Jira request body.",
              cause,
            }),
        ),
      );
      return { request: withBody, baseUrl: creds.baseUrl };
    });

  const parseRetryAfter = (response: HttpClientResponse.HttpClientResponse): number => {
    const value = response.headers["retry-after"];
    if (typeof value !== "string") return 1000;
    const seconds = Number.parseFloat(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return 1000;
    return Math.min(60_000, Math.round(seconds * 1000));
  };

  const mapResponseFailure = (
    response: HttpClientResponse.HttpClientResponse,
    resource: string,
  ): JiraReadError => {
    const status = response.status;
    if (status === 401 || status === 403) {
      return new JiraAuthError({
        detail: `Jira returned ${status} for ${resource}.`,
        status,
      });
    }
    if (status === 404) {
      return new JiraNotFoundError({ resource });
    }
    if (status === 429) {
      return new JiraRateLimitedError({ retryAfterMs: parseRetryAfter(response) });
    }
    return new JiraNetworkError({
      detail: `Jira returned HTTP ${status} for ${resource}.`,
    });
  };

  const executeJson = <A>(
    request: HttpClientRequest.HttpClientRequest,
    resource: string,
    map: (raw: any) => A,
  ): Effect.Effect<A, JiraReadError> =>
    httpClient.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new JiraNetworkError({
            detail: `Network failure contacting Jira (${resource}).`,
            cause,
          }),
      ),
      Effect.flatMap((response) => {
        if (response.status >= 200 && response.status < 300) {
          if (response.status === 204) {
            return Effect.succeed(map(undefined));
          }
          return response.json.pipe(
            Effect.mapError(
              (cause) =>
                new JiraDecodeError({
                  detail: `Failed to decode Jira response for ${resource}: ${
                    cause instanceof Error ? cause.message : String(cause)
                  }`,
                }),
            ),
            Effect.map(map),
          );
        }
        return Effect.fail(mapResponseFailure(response, resource));
      }),
      Effect.retry({
        schedule: Schedule.exponential(Duration.millis(400)),
        times: 2,
        while: (error) => error._tag === "JiraRateLimitedError",
      }),
    );

  const currentUser: JiraClientShape["currentUser"] = Effect.gen(function* () {
    const { request } = yield* buildRequest("GET", "/rest/api/3/myself");
    return yield* executeJson(request, "myself", (raw): JiraUser => ({
      accountId: raw.accountId,
      displayName: typeof raw.displayName === "string" ? raw.displayName : raw.accountId,
      ...(typeof raw.emailAddress === "string" ? { emailAddress: raw.emailAddress } : {}),
    }));
  });

  const search: JiraClientShape["search"] = (input) =>
    Effect.gen(function* () {
      const params = new URLSearchParams();
      params.set("jql", input.jql);
      params.set(
        "fields",
        ["summary", "status", "assignee", "reporter", "updated"].join(","),
      );
      if (input.maxResults !== undefined) {
        params.set("maxResults", String(input.maxResults));
      } else {
        params.set("maxResults", "20");
      }
      const { request, baseUrl } = yield* buildRequest(
        "GET",
        `/rest/api/3/search/jql?${params.toString()}`,
      );
      return yield* executeJson(request, "search", (raw): JiraSearchPage => {
        const issues: JiraIssue[] = [];
        if (Array.isArray(raw?.issues)) {
          for (const candidate of raw.issues) {
            const adapted = adaptIssue(baseUrl, candidate);
            if (adapted) issues.push(adapted);
          }
        }
        return {
          total: typeof raw?.total === "number" ? raw.total : issues.length,
          startAt: typeof raw?.startAt === "number" ? raw.startAt : 0,
          issues,
        };
      });
    });

  const getIssue: JiraClientShape["getIssue"] = ({ issueKey }) =>
    Effect.gen(function* () {
      const { request, baseUrl } = yield* buildRequest(
        "GET",
        `/rest/api/3/issue/${issueKey}?fields=summary,status,assignee,reporter,updated,description`,
      );
      return yield* executeJson(request, `issue ${issueKey}`, (raw): JiraIssue => {
        const adapted = adaptIssue(baseUrl, raw);
        if (!adapted) {
          throw new JiraDecodeError({
            detail: `Issue ${issueKey} returned an unexpected shape.`,
          });
        }
        return adapted;
      });
    });

  const createIssue: JiraClientShape["createIssue"] = (input) =>
    Effect.gen(function* () {
      const body = {
        fields: {
          project: { key: input.projectKey },
          summary: input.summary,
          issuetype: { name: input.issueType },
          ...(input.description !== undefined && input.description.length > 0
            ? {
                description: {
                  type: "doc",
                  version: 1,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: input.description }],
                    },
                  ],
                },
              }
            : {}),
        },
      };
      const { request, baseUrl } = yield* buildRequest("POST", "/rest/api/3/issue", body);
      const created = yield* executeJson(
        request,
        `createIssue ${input.projectKey}`,
        (raw) => raw,
      );
      const key =
        typeof created?.key === "string"
          ? created.key
          : (() => {
              throw new JiraDecodeError({
                detail: "Jira create issue response is missing 'key'.",
              });
            })();
      return yield* getIssue({ issueKey: JiraIssueKeySchema.make(key) }).pipe(
        Effect.catch((cause) =>
          cause._tag === "JiraNotFoundError"
            ? Effect.succeed({
                key: JiraIssueKeySchema.make(key),
                summary: input.summary,
                url: issueBrowseUrl(baseUrl, key),
              } satisfies JiraIssue)
            : Effect.fail(cause),
        ),
      );
    });

  const listTransitions: JiraClientShape["listTransitions"] = ({ issueKey }) =>
    Effect.gen(function* () {
      const { request } = yield* buildRequest(
        "GET",
        `/rest/api/3/issue/${issueKey}/transitions`,
      );
      return yield* executeJson(
        request,
        `transitions ${issueKey}`,
        (raw): ReadonlyArray<JiraTransition> => {
          const list: JiraTransition[] = [];
          if (Array.isArray(raw?.transitions)) {
            for (const entry of raw.transitions) {
              if (typeof entry?.id === "string" && typeof entry?.name === "string") {
                const status = adaptStatus(entry.to);
                list.push({
                  id: entry.id,
                  name: entry.name,
                  ...(status ? { toStatus: status } : {}),
                });
              }
            }
          }
          return list;
        },
      );
    });

  const transitionIssue: JiraClientShape["transitionIssue"] = ({ issueKey, transitionId }) =>
    Effect.gen(function* () {
      const { request } = yield* buildRequest(
        "POST",
        `/rest/api/3/issue/${issueKey}/transitions`,
        { transition: { id: transitionId } },
      );
      yield* executeJson(request, `transition ${issueKey}`, () => undefined);
    });

  const addComment: JiraClientShape["addComment"] = ({ issueKey, body }) =>
    Effect.gen(function* () {
      const payload = {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: body }],
            },
          ],
        },
      };
      const { request } = yield* buildRequest(
        "POST",
        `/rest/api/3/issue/${issueKey}/comment`,
        payload,
      );
      return yield* executeJson(
        request,
        `comment ${issueKey}`,
        (raw): JiraComment => ({
          id: typeof raw?.id === "string" ? raw.id : "",
          ...(adaptUser(raw?.author) ? { author: adaptUser(raw.author)! } : {}),
          body,
          ...(typeof raw?.created === "string" ? { created: raw.created } : {}),
        }),
      );
    });

  const listComments: JiraClientShape["listComments"] = ({ issueKey, maxResults }) =>
    Effect.gen(function* () {
      const params = new URLSearchParams();
      params.set("orderBy", "-created");
      params.set("maxResults", String(maxResults ?? 10));
      const { request } = yield* buildRequest(
        "GET",
        `/rest/api/3/issue/${issueKey}/comment?${params.toString()}`,
      );
      return yield* executeJson(
        request,
        `comments ${issueKey}`,
        (raw): ReadonlyArray<JiraComment> => {
          const list: JiraComment[] = [];
          if (Array.isArray(raw?.comments)) {
            for (const entry of raw.comments) {
              if (typeof entry?.id !== "string") continue;
              const body = adaptDescription(entry.body) ?? "";
              const author = adaptUser(entry.author);
              list.push({
                id: entry.id,
                body,
                ...(author ? { author } : {}),
                ...(typeof entry.created === "string" ? { created: entry.created } : {}),
              });
            }
          }
          return list;
        },
      );
    });

  return {
    currentUser,
    search,
    getIssue,
    createIssue,
    listTransitions,
    transitionIssue,
    addComment,
    listComments,
  } satisfies JiraClientShape;
});

export const JiraClientLive = Layer.effect(JiraClient, makeJiraClient);
