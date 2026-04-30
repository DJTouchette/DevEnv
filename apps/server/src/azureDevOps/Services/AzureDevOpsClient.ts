/**
 * AzureDevOpsClient - Effect service for Azure DevOps REST API operations.
 *
 * Loads credentials from {@link AzureDevOpsCredentials}, builds an HTTP Basic
 * `Authorization` header (empty username, PAT as password), and exposes the
 * project/PR/pipeline endpoints used by the WS RPC layer. Maps HTTP status
 * codes to typed errors and retries `429` responses with exponential backoff.
 *
 * @module AzureDevOpsClient
 */
import {
  type AdoBuild,
  AdoBuildId as AdoBuildIdSchema,
  type AdoBuildLogChunk,
  type AdoBuildResult,
  type AdoBuildStatus,
  type AdoBuildTimeline,
  AdoConfigError,
  type AdoCredentials,
  AdoDecodeError,
  AdoNotFoundError,
  AdoNetworkError,
  AdoProjectId as AdoProjectIdSchema,
  type AdoProject,
  type AdoProjectId,
  type AdoPullRequest,
  type AdoPullRequestComment,
  type AdoPullRequestStatus,
  AdoRateLimitedError,
  AdoRepositoryId as AdoRepositoryIdSchema,
  type AdoSearchPullRequestsInput,
  type AdoSearchPullRequestsPage,
  type AdoTimelineRecord,
  type AdoTimelineRecordState,
  type AdoUser,
  AdoAuthError,
} from "@t3tools/contracts";
import { Context, Duration, Effect, Layer, Option, Schedule } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { AzureDevOpsCredentials as AzureDevOpsCredentialsService } from "./AzureDevOpsCredentials.ts";

export type AdoReadError =
  | AdoConfigError
  | AdoAuthError
  | AdoNotFoundError
  | AdoRateLimitedError
  | AdoNetworkError
  | AdoDecodeError;

export interface AzureDevOpsClientShape {
  readonly listProjects: Effect.Effect<ReadonlyArray<AdoProject>, AdoReadError>;
  readonly searchPullRequests: (
    input: AdoSearchPullRequestsInput,
  ) => Effect.Effect<AdoSearchPullRequestsPage, AdoReadError>;
  readonly getPullRequest: (input: {
    readonly projectId: AdoProjectId;
    readonly repositoryId: string;
    readonly pullRequestId: number;
  }) => Effect.Effect<AdoPullRequest, AdoReadError>;
  readonly addPullRequestComment: (input: {
    readonly projectId: AdoProjectId;
    readonly repositoryId: string;
    readonly pullRequestId: number;
    readonly body: string;
  }) => Effect.Effect<AdoPullRequestComment, AdoReadError>;
  readonly listPullRequestComments: (input: {
    readonly projectId: AdoProjectId;
    readonly repositoryId: string;
    readonly pullRequestId: number;
  }) => Effect.Effect<ReadonlyArray<AdoPullRequestComment>, AdoReadError>;
  readonly listActiveBuilds: (input: {
    readonly projectId: AdoProjectId;
  }) => Effect.Effect<ReadonlyArray<AdoBuild>, AdoReadError>;
  readonly listRecentBuilds: (input: {
    readonly projectId: AdoProjectId;
    readonly maxResults?: number;
  }) => Effect.Effect<ReadonlyArray<AdoBuild>, AdoReadError>;
  readonly getBuildTimeline: (input: {
    readonly projectId: AdoProjectId;
    readonly buildId: string;
  }) => Effect.Effect<AdoBuildTimeline, AdoReadError>;
  readonly getBuildLog: (input: {
    readonly projectId: AdoProjectId;
    readonly buildId: string;
    readonly logId: number;
    readonly startLine?: number;
  }) => Effect.Effect<AdoBuildLogChunk, AdoReadError>;
}

export class AzureDevOpsClient extends Context.Service<
  AzureDevOpsClient,
  AzureDevOpsClientShape
>()("t3/azureDevOps/Services/AzureDevOpsClient") {}

const buildAuthHeader = (creds: AdoCredentials): string => {
  const token = Buffer.from(`:${creds.pat}`).toString("base64");
  return `Basic ${token}`;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const API_VERSION = "7.1";

const adaptUser = (raw: any): AdoUser | undefined => {
  if (!raw || typeof raw.id !== "string") return undefined;
  return {
    id: raw.id,
    displayName: typeof raw.displayName === "string" ? raw.displayName : raw.id,
    ...(typeof raw.uniqueName === "string" ? { uniqueName: raw.uniqueName } : {}),
  };
};

const adaptProject = (raw: any): AdoProject | null => {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: AdoProjectIdSchema.make(raw.id),
    name: raw.name,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    url: typeof raw.url === "string" ? raw.url : "",
  };
};

const adaptPullRequestStatus = (raw: unknown): AdoPullRequestStatus => {
  if (raw === "active" || raw === "completed" || raw === "abandoned") return raw;
  return "active";
};

const pullRequestWebUrl = (
  orgUrl: string,
  projectName: string,
  repositoryName: string,
  pullRequestId: number,
): string =>
  `${trimTrailingSlash(orgUrl)}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(
    repositoryName,
  )}/pullrequest/${pullRequestId}`;

const adaptPullRequest = (orgUrl: string, raw: any): AdoPullRequest | null => {
  if (
    !raw ||
    typeof raw.pullRequestId !== "number" ||
    !raw.repository ||
    typeof raw.repository.id !== "string" ||
    typeof raw.repository.name !== "string" ||
    !raw.repository.project ||
    typeof raw.repository.project.id !== "string" ||
    typeof raw.repository.project.name !== "string"
  ) {
    return null;
  }
  const projectId = AdoProjectIdSchema.make(raw.repository.project.id);
  const repositoryId = AdoRepositoryIdSchema.make(raw.repository.id);
  return {
    pullRequestId: raw.pullRequestId,
    title: typeof raw.title === "string" ? raw.title : `PR ${raw.pullRequestId}`,
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    status: adaptPullRequestStatus(raw.status),
    ...(adaptUser(raw.createdBy) ? { createdBy: adaptUser(raw.createdBy)! } : {}),
    ...(typeof raw.creationDate === "string" ? { creationDate: raw.creationDate } : {}),
    ...(typeof raw.sourceRefName === "string" ? { sourceRefName: raw.sourceRefName } : {}),
    ...(typeof raw.targetRefName === "string" ? { targetRefName: raw.targetRefName } : {}),
    repositoryId,
    repositoryName: raw.repository.name,
    projectId,
    projectName: raw.repository.project.name,
    url: pullRequestWebUrl(orgUrl, raw.repository.project.name, raw.repository.name, raw.pullRequestId),
    ...(typeof raw.isDraft === "boolean" ? { isDraft: raw.isDraft } : {}),
    ...(typeof raw.mergeStatus === "string" ? { mergeStatus: raw.mergeStatus } : {}),
  };
};

const adaptBuildStatus = (raw: unknown): AdoBuildStatus => {
  if (
    raw === "none" ||
    raw === "notStarted" ||
    raw === "inProgress" ||
    raw === "completing" ||
    raw === "completed" ||
    raw === "cancelling" ||
    raw === "postponed"
  ) {
    return raw;
  }
  return "none";
};

const adaptBuildResult = (raw: unknown): AdoBuildResult | undefined => {
  if (
    raw === "none" ||
    raw === "succeeded" ||
    raw === "partiallySucceeded" ||
    raw === "failed" ||
    raw === "canceled"
  ) {
    return raw;
  }
  return undefined;
};

const buildWebUrl = (orgUrl: string, projectName: string, buildId: number | string): string =>
  `${trimTrailingSlash(orgUrl)}/${encodeURIComponent(
    projectName,
  )}/_build/results?buildId=${buildId}&view=results`;

const adaptBuild = (orgUrl: string, raw: any): AdoBuild | null => {
  if (
    !raw ||
    (typeof raw.id !== "number" && typeof raw.id !== "string") ||
    !raw.project ||
    typeof raw.project.id !== "string" ||
    typeof raw.project.name !== "string" ||
    !raw.definition ||
    typeof raw.definition.id !== "number" ||
    typeof raw.definition.name !== "string"
  ) {
    return null;
  }
  const id = String(raw.id);
  return {
    id: AdoBuildIdSchema.make(id),
    buildNumber: typeof raw.buildNumber === "string" ? raw.buildNumber : id,
    status: adaptBuildStatus(raw.status),
    ...(adaptBuildResult(raw.result) ? { result: adaptBuildResult(raw.result)! } : {}),
    ...(typeof raw.startTime === "string" ? { startTime: raw.startTime } : {}),
    ...(typeof raw.queueTime === "string" ? { queueTime: raw.queueTime } : {}),
    ...(typeof raw.finishTime === "string" ? { finishTime: raw.finishTime } : {}),
    ...(typeof raw.sourceBranch === "string" ? { sourceBranch: raw.sourceBranch } : {}),
    ...(typeof raw.sourceVersion === "string" ? { sourceVersion: raw.sourceVersion } : {}),
    definition: { id: raw.definition.id, name: raw.definition.name },
    projectId: AdoProjectIdSchema.make(raw.project.id),
    projectName: raw.project.name,
    url: buildWebUrl(orgUrl, raw.project.name, raw.id),
    ...(adaptUser(raw.requestedFor) ? { requestedFor: adaptUser(raw.requestedFor)! } : {}),
  };
};

const adaptTimelineRecordState = (raw: unknown): AdoTimelineRecordState => {
  if (raw === "pending" || raw === "inProgress" || raw === "completed") return raw;
  return "pending";
};

const adaptTimelineRecord = (raw: any): AdoTimelineRecord | null => {
  if (!raw || typeof raw.id !== "string" || typeof raw.type !== "string") return null;
  return {
    id: raw.id,
    ...(typeof raw.parentId === "string" || raw.parentId === null
      ? { parentId: raw.parentId }
      : {}),
    type: raw.type,
    name: typeof raw.name === "string" ? raw.name : raw.type,
    state: adaptTimelineRecordState(raw.state),
    ...(adaptBuildResult(raw.result) ? { result: adaptBuildResult(raw.result)! } : {}),
    ...(typeof raw.startTime === "string" ? { startTime: raw.startTime } : {}),
    ...(typeof raw.finishTime === "string" ? { finishTime: raw.finishTime } : {}),
    ...(typeof raw.percentComplete === "number" ? { percentComplete: raw.percentComplete } : {}),
    ...(typeof raw.errorCount === "number" ? { errorCount: raw.errorCount } : {}),
    ...(typeof raw.warningCount === "number" ? { warningCount: raw.warningCount } : {}),
    ...(raw.log && typeof raw.log.id === "number" ? { logId: raw.log.id } : {}),
    ...(typeof raw.order === "number" ? { order: raw.order } : {}),
  };
};

const parseRetryAfter = (response: HttpClientResponse.HttpClientResponse): number => {
  const value = response.headers["retry-after"];
  if (typeof value !== "string") return 1000;
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 1000;
  return Math.min(60_000, Math.round(seconds * 1000));
};

export const makeAzureDevOpsClient = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const credentials = yield* AzureDevOpsCredentialsService;

  const requireCreds = credentials.get.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new AdoConfigError({
              detail: "No Azure DevOps credentials configured.",
            }),
          ),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
    Effect.catchTag("AdoStorageError", (cause) =>
      Effect.fail(new AdoConfigError({ detail: cause.detail })),
    ),
  );

  const buildRequest = (
    method: "GET" | "POST",
    pathSegment: string,
    body?: unknown,
  ): Effect.Effect<
    {
      readonly request: HttpClientRequest.HttpClientRequest;
      readonly orgUrl: string;
    },
    AdoReadError
  > =>
    Effect.gen(function* () {
      const creds = yield* requireCreds;
      const baseUrl = trimTrailingSlash(creds.orgUrl);
      const url = `${baseUrl}${pathSegment.startsWith("/") ? pathSegment : `/${pathSegment}`}`;
      const headers: Record<string, string> = {
        Authorization: buildAuthHeader(creds),
        Accept: "application/json",
      };
      const baseRequest =
        method === "GET" ? HttpClientRequest.get(url) : HttpClientRequest.post(url);
      const withHeaders = baseRequest.pipe(HttpClientRequest.setHeaders(headers));
      if (body === undefined) {
        return { request: withHeaders, orgUrl: creds.orgUrl };
      }
      const withBody = yield* HttpClientRequest.bodyJson(body)(withHeaders).pipe(
        Effect.mapError(
          (cause) =>
            new AdoNetworkError({
              detail: "Failed to encode Azure DevOps request body.",
              cause,
            }),
        ),
      );
      return { request: withBody, orgUrl: creds.orgUrl };
    });

  const mapResponseFailure = (
    response: HttpClientResponse.HttpClientResponse,
    resource: string,
  ): AdoReadError => {
    const status = response.status;
    if (status === 401 || status === 403) {
      return new AdoAuthError({
        detail: `Azure DevOps returned ${status} for ${resource}.`,
        status,
      });
    }
    if (status === 404) {
      return new AdoNotFoundError({ resource });
    }
    if (status === 429) {
      return new AdoRateLimitedError({ retryAfterMs: parseRetryAfter(response) });
    }
    return new AdoNetworkError({
      detail: `Azure DevOps returned HTTP ${status} for ${resource}.`,
    });
  };

  const executeJson = <A>(
    request: HttpClientRequest.HttpClientRequest,
    resource: string,
    map: (raw: any) => A,
  ): Effect.Effect<A, AdoReadError> =>
    httpClient.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new AdoNetworkError({
            detail: `Network failure contacting Azure DevOps (${resource}).`,
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
                new AdoDecodeError({
                  detail: `Failed to decode Azure DevOps response for ${resource}: ${
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
        while: (error) => error._tag === "AdoRateLimitedError",
      }),
    );

  const executeText = (
    request: HttpClientRequest.HttpClientRequest,
    resource: string,
  ): Effect.Effect<string, AdoReadError> =>
    httpClient.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new AdoNetworkError({
            detail: `Network failure contacting Azure DevOps (${resource}).`,
            cause,
          }),
      ),
      Effect.flatMap((response) => {
        if (response.status >= 200 && response.status < 300) {
          if (response.status === 204) {
            return Effect.succeed("");
          }
          return response.text.pipe(
            Effect.mapError(
              (cause) =>
                new AdoDecodeError({
                  detail: `Failed to read Azure DevOps response for ${resource}: ${
                    cause instanceof Error ? cause.message : String(cause)
                  }`,
                }),
            ),
          );
        }
        return Effect.fail(mapResponseFailure(response, resource));
      }),
      Effect.retry({
        schedule: Schedule.exponential(Duration.millis(400)),
        times: 2,
        while: (error) => error._tag === "AdoRateLimitedError",
      }),
    );

  const listProjects: AzureDevOpsClientShape["listProjects"] = Effect.gen(function* () {
    const { request } = yield* buildRequest(
      "GET",
      `/_apis/projects?api-version=${API_VERSION}&$top=500`,
    );
    return yield* executeJson(request, "projects", (raw): ReadonlyArray<AdoProject> => {
      const list: AdoProject[] = [];
      if (Array.isArray(raw?.value)) {
        for (const candidate of raw.value) {
          const adapted = adaptProject(candidate);
          if (adapted) list.push(adapted);
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    });
  });

  const fetchPullRequestPage = (params: URLSearchParams, projectId: AdoProjectId | undefined) =>
    Effect.gen(function* () {
      const segment = projectId
        ? `/${encodeURIComponent(projectId)}/_apis/git/pullrequests?${params.toString()}`
        : `/_apis/git/pullrequests?${params.toString()}`;
      const { request, orgUrl } = yield* buildRequest("GET", segment);
      return yield* executeJson(
        request,
        `pullrequests${projectId ? ` (${projectId})` : ""}`,
        (raw): ReadonlyArray<AdoPullRequest> => {
          const list: AdoPullRequest[] = [];
          if (Array.isArray(raw?.value)) {
            for (const candidate of raw.value) {
              const adapted = adaptPullRequest(orgUrl, candidate);
              if (adapted) list.push(adapted);
            }
          }
          return list;
        },
      );
    });

  const searchPullRequests: AzureDevOpsClientShape["searchPullRequests"] = (input) =>
    Effect.gen(function* () {
      const max =
        typeof input.maxResults === "number" && input.maxResults > 0
          ? Math.min(input.maxResults, 100)
          : 50;
      const params = new URLSearchParams();
      params.set("searchCriteria.status", "active");
      params.set("$top", String(max));
      params.set("api-version", API_VERSION);
      const fetched = yield* fetchPullRequestPage(params, input.projectId);
      const trimmed = (input.query ?? "").trim().toLowerCase();
      const filtered =
        trimmed.length === 0
          ? fetched
          : fetched.filter((pr) => {
              if (pr.title.toLowerCase().includes(trimmed)) return true;
              if (pr.repositoryName.toLowerCase().includes(trimmed)) return true;
              if (pr.projectName.toLowerCase().includes(trimmed)) return true;
              if (String(pr.pullRequestId) === trimmed) return true;
              return false;
            });
      return { pullRequests: filtered };
    });

  const getPullRequest: AzureDevOpsClientShape["getPullRequest"] = ({
    projectId,
    repositoryId,
    pullRequestId,
  }) =>
    Effect.gen(function* () {
      const segment = `/${encodeURIComponent(projectId)}/_apis/git/repositories/${encodeURIComponent(
        repositoryId,
      )}/pullrequests/${pullRequestId}?api-version=${API_VERSION}`;
      const { request, orgUrl } = yield* buildRequest("GET", segment);
      return yield* executeJson(request, `pullrequest ${pullRequestId}`, (raw): AdoPullRequest => {
        const adapted = adaptPullRequest(orgUrl, raw);
        if (!adapted) {
          throw new AdoDecodeError({
            detail: `Pull request ${pullRequestId} returned an unexpected shape.`,
          });
        }
        return adapted;
      });
    });

  const addPullRequestComment: AzureDevOpsClientShape["addPullRequestComment"] = ({
    projectId,
    repositoryId,
    pullRequestId,
    body,
  }) =>
    Effect.gen(function* () {
      const segment = `/${encodeURIComponent(projectId)}/_apis/git/repositories/${encodeURIComponent(
        repositoryId,
      )}/pullrequests/${pullRequestId}/threads?api-version=${API_VERSION}`;
      const payload = {
        comments: [{ parentCommentId: 0, content: body, commentType: "text" }],
        status: "active",
      };
      const { request } = yield* buildRequest("POST", segment, payload);
      return yield* executeJson(
        request,
        `comment pr ${pullRequestId}`,
        (raw): AdoPullRequestComment => {
          const first = Array.isArray(raw?.comments) ? raw.comments[0] : undefined;
          return {
            id: typeof first?.id === "number" ? first.id : 0,
            body: typeof first?.content === "string" ? first.content : body,
            ...(adaptUser(first?.author) ? { author: adaptUser(first.author)! } : {}),
            ...(typeof first?.publishedDate === "string"
              ? { publishedDate: first.publishedDate }
              : {}),
          };
        },
      );
    });

  const listPullRequestComments: AzureDevOpsClientShape["listPullRequestComments"] = ({
    projectId,
    repositoryId,
    pullRequestId,
  }) =>
    Effect.gen(function* () {
      const segment = `/${encodeURIComponent(projectId)}/_apis/git/repositories/${encodeURIComponent(
        repositoryId,
      )}/pullrequests/${pullRequestId}/threads?api-version=${API_VERSION}`;
      const { request } = yield* buildRequest("GET", segment);
      return yield* executeJson(
        request,
        `pr threads ${pullRequestId}`,
        (raw): ReadonlyArray<AdoPullRequestComment> => {
          const list: AdoPullRequestComment[] = [];
          if (!Array.isArray(raw?.value)) return list;
          for (const thread of raw.value) {
            if (thread?.isDeleted === true) continue;
            // Skip system status-update threads (no human comments).
            if (!Array.isArray(thread?.comments)) continue;
            for (const comment of thread.comments) {
              if (comment?.isDeleted === true) continue;
              if (typeof comment?.id !== "number") continue;
              if (comment?.commentType === "system") continue;
              const body = typeof comment.content === "string" ? comment.content : "";
              if (body.length === 0) continue;
              const author = adaptUser(comment.author);
              list.push({
                id: comment.id,
                body,
                ...(author ? { author } : {}),
                ...(typeof comment.publishedDate === "string"
                  ? { publishedDate: comment.publishedDate }
                  : {}),
              });
            }
          }
          // Newest first.
          list.sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""));
          return list;
        },
      );
    });

  const listActiveBuilds: AzureDevOpsClientShape["listActiveBuilds"] = ({ projectId }) =>
    Effect.gen(function* () {
      const params = new URLSearchParams();
      params.set("statusFilter", "inProgress,notStarted");
      params.set("queryOrder", "queueTimeDescending");
      params.set("$top", "50");
      params.set("api-version", API_VERSION);
      const segment = `/${encodeURIComponent(projectId)}/_apis/build/builds?${params.toString()}`;
      const { request, orgUrl } = yield* buildRequest("GET", segment);
      return yield* executeJson(
        request,
        `builds (${projectId})`,
        (raw): ReadonlyArray<AdoBuild> => {
          const list: AdoBuild[] = [];
          if (Array.isArray(raw?.value)) {
            for (const candidate of raw.value) {
              const adapted = adaptBuild(orgUrl, candidate);
              if (adapted) list.push(adapted);
            }
          }
          return list;
        },
      );
    });

  const listRecentBuilds: AzureDevOpsClientShape["listRecentBuilds"] = ({
    projectId,
    maxResults,
  }) =>
    Effect.gen(function* () {
      const top = Math.max(1, Math.min(maxResults ?? 25, 200));
      const params = new URLSearchParams();
      params.set("statusFilter", "completed");
      params.set("queryOrder", "finishTimeDescending");
      params.set("$top", String(top));
      params.set("api-version", API_VERSION);
      const segment = `/${encodeURIComponent(projectId)}/_apis/build/builds?${params.toString()}`;
      const { request, orgUrl } = yield* buildRequest("GET", segment);
      return yield* executeJson(
        request,
        `recent builds (${projectId})`,
        (raw): ReadonlyArray<AdoBuild> => {
          const list: AdoBuild[] = [];
          if (Array.isArray(raw?.value)) {
            for (const candidate of raw.value) {
              const adapted = adaptBuild(orgUrl, candidate);
              if (adapted) list.push(adapted);
            }
          }
          return list;
        },
      );
    });

  const getBuildTimeline: AzureDevOpsClientShape["getBuildTimeline"] = ({ projectId, buildId }) =>
    Effect.gen(function* () {
      const segment = `/${encodeURIComponent(projectId)}/_apis/build/builds/${encodeURIComponent(
        buildId,
      )}/timeline?api-version=${API_VERSION}`;
      const { request } = yield* buildRequest("GET", segment);
      return yield* executeJson(request, `timeline ${buildId}`, (raw): AdoBuildTimeline => {
        const records: AdoTimelineRecord[] = [];
        if (Array.isArray(raw?.records)) {
          for (const candidate of raw.records) {
            const adapted = adaptTimelineRecord(candidate);
            if (adapted) records.push(adapted);
          }
        }
        records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { buildId: AdoBuildIdSchema.make(String(buildId)), records };
      });
    });

  const getBuildLog: AzureDevOpsClientShape["getBuildLog"] = ({
    projectId,
    buildId,
    logId,
    startLine,
  }) =>
    Effect.gen(function* () {
      const params = new URLSearchParams();
      if (typeof startLine === "number" && startLine > 0) {
        params.set("startLine", String(startLine));
      }
      params.set("api-version", API_VERSION);
      const segment = `/${encodeURIComponent(
        projectId,
      )}/_apis/build/builds/${encodeURIComponent(buildId)}/logs/${logId}?${params.toString()}`;
      const { request } = yield* buildRequest("GET", segment);
      const text = yield* executeText(request, `log ${buildId}/${logId}`);
      const lines = text.length === 0 ? [] : text.split(/\r?\n/);
      // Drop trailing empty line from a final newline.
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      const begin = typeof startLine === "number" && startLine > 0 ? startLine : 0;
      return {
        buildId: AdoBuildIdSchema.make(String(buildId)),
        logId,
        startLine: begin,
        endLine: begin + lines.length,
        lines,
        done: false,
      } satisfies AdoBuildLogChunk;
    });

  return {
    listProjects,
    searchPullRequests,
    getPullRequest,
    addPullRequestComment,
    listPullRequestComments,
    listActiveBuilds,
    listRecentBuilds,
    getBuildTimeline,
    getBuildLog,
  } satisfies AzureDevOpsClientShape;
});

export const AzureDevOpsClientLive = Layer.effect(AzureDevOpsClient, makeAzureDevOpsClient);
