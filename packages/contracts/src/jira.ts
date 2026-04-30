/**
 * Jira contracts.
 *
 * Schemas, identifiers, and RPC errors shared by server and web for the Jira
 * Cloud integration. The credential schema is a discriminated union so both
 * email + API token (Basic) and API key / OAuth Bearer flows are first-class.
 *
 * @module Jira
 */
import { Schema } from "effect";
import { TrimmedNonEmptyString, ThreadId } from "./baseSchemas.ts";

const TrimmedString = Schema.Trim;

export const JiraIssueKey = TrimmedNonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[A-Z][A-Z0-9_]+-\d+$/)),
  Schema.brand("JiraIssueKey"),
);
export type JiraIssueKey = typeof JiraIssueKey.Type;

export const JiraBaseUrl = TrimmedNonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^https?:\/\//)),
);
export type JiraBaseUrl = typeof JiraBaseUrl.Type;

export const JiraBasicCredentials = Schema.Struct({
  kind: Schema.Literal("basic"),
  baseUrl: JiraBaseUrl,
  email: TrimmedNonEmptyString,
  apiToken: TrimmedNonEmptyString,
});
export type JiraBasicCredentials = typeof JiraBasicCredentials.Type;

export const JiraBearerCredentials = Schema.Struct({
  kind: Schema.Literal("bearer"),
  baseUrl: JiraBaseUrl,
  apiKey: TrimmedNonEmptyString,
});
export type JiraBearerCredentials = typeof JiraBearerCredentials.Type;

export const JiraCredentials = Schema.Union([JiraBasicCredentials, JiraBearerCredentials]);
export type JiraCredentials = typeof JiraCredentials.Type;

export const JiraCredentialsSnapshot = Schema.Struct({
  configured: Schema.Boolean,
  kind: Schema.optional(Schema.Literals(["basic", "bearer"])),
  baseUrl: Schema.optional(JiraBaseUrl),
  email: Schema.optional(TrimmedNonEmptyString),
});
export type JiraCredentialsSnapshot = typeof JiraCredentialsSnapshot.Type;

export const JiraUser = Schema.Struct({
  accountId: TrimmedNonEmptyString,
  displayName: Schema.String,
  emailAddress: Schema.optional(Schema.String),
});
export type JiraUser = typeof JiraUser.Type;

export const JiraStatus = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: Schema.String,
  category: Schema.optional(Schema.String),
});
export type JiraStatus = typeof JiraStatus.Type;

export const JiraIssue = Schema.Struct({
  key: JiraIssueKey,
  summary: Schema.String,
  status: Schema.optional(JiraStatus),
  assignee: Schema.optional(Schema.NullOr(JiraUser)),
  reporter: Schema.optional(Schema.NullOr(JiraUser)),
  url: Schema.String,
  updated: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});
export type JiraIssue = typeof JiraIssue.Type;

export const JiraSearchPage = Schema.Struct({
  total: Schema.Number,
  startAt: Schema.Number,
  issues: Schema.Array(JiraIssue),
});
export type JiraSearchPage = typeof JiraSearchPage.Type;

export const JiraSearchInput = Schema.Struct({
  jql: TrimmedString,
  maxResults: Schema.optional(Schema.Number),
  startAt: Schema.optional(Schema.Number),
});
export type JiraSearchInput = typeof JiraSearchInput.Type;

export const JiraIssueCreateInput = Schema.Struct({
  projectKey: TrimmedNonEmptyString,
  issueType: TrimmedNonEmptyString,
  summary: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
});
export type JiraIssueCreateInput = typeof JiraIssueCreateInput.Type;

export const JiraTransition = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: Schema.String,
  toStatus: Schema.optional(JiraStatus),
});
export type JiraTransition = typeof JiraTransition.Type;

export const JiraComment = Schema.Struct({
  id: TrimmedNonEmptyString,
  author: Schema.optional(JiraUser),
  body: Schema.String,
  created: Schema.optional(Schema.String),
});
export type JiraComment = typeof JiraComment.Type;

export const JiraThreadLink = Schema.Struct({
  threadId: ThreadId,
  issueKey: JiraIssueKey,
  baseUrl: JiraBaseUrl,
  linkedAt: Schema.String,
});
export type JiraThreadLink = typeof JiraThreadLink.Type;

export const JiraThreadLinkSnapshot = Schema.Array(JiraThreadLink);
export type JiraThreadLinkSnapshot = typeof JiraThreadLinkSnapshot.Type;

export const JiraThreadLinkChange = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("linked"),
    link: JiraThreadLink,
  }),
  Schema.Struct({
    type: Schema.Literal("unlinked"),
    threadId: ThreadId,
  }),
]);
export type JiraThreadLinkChange = typeof JiraThreadLinkChange.Type;

export const JiraThreadLinksStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    links: JiraThreadLinkSnapshot,
  }),
  Schema.Struct({
    type: Schema.Literal("change"),
    change: JiraThreadLinkChange,
  }),
]);
export type JiraThreadLinksStreamEvent = typeof JiraThreadLinksStreamEvent.Type;

export const JiraLinkThreadInput = Schema.Struct({
  threadId: ThreadId,
  issueKey: JiraIssueKey,
});
export type JiraLinkThreadInput = typeof JiraLinkThreadInput.Type;

export const JiraUnlinkThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type JiraUnlinkThreadInput = typeof JiraUnlinkThreadInput.Type;

export const JiraGetThreadLinkInput = Schema.Struct({
  threadId: ThreadId,
});
export type JiraGetThreadLinkInput = typeof JiraGetThreadLinkInput.Type;

export const JiraTransitionIssueInput = Schema.Struct({
  issueKey: JiraIssueKey,
  transitionId: TrimmedNonEmptyString,
});
export type JiraTransitionIssueInput = typeof JiraTransitionIssueInput.Type;

export const JiraAddCommentInput = Schema.Struct({
  issueKey: JiraIssueKey,
  body: TrimmedNonEmptyString,
});
export type JiraAddCommentInput = typeof JiraAddCommentInput.Type;

export const JiraGetIssueInput = Schema.Struct({
  issueKey: JiraIssueKey,
});
export type JiraGetIssueInput = typeof JiraGetIssueInput.Type;

export const JiraListTransitionsInput = Schema.Struct({
  issueKey: JiraIssueKey,
});
export type JiraListTransitionsInput = typeof JiraListTransitionsInput.Type;

export const JiraListCommentsInput = Schema.Struct({
  issueKey: JiraIssueKey,
  maxResults: Schema.optional(Schema.Number),
});
export type JiraListCommentsInput = typeof JiraListCommentsInput.Type;

export const JiraSetCredentialsInput = JiraCredentials;

export class JiraConfigError extends Schema.TaggedErrorClass<JiraConfigError>()("JiraConfigError", {
  detail: Schema.String,
}) {
  override get message(): string {
    return `Jira is not configured: ${this.detail}`;
  }
}

export class JiraAuthError extends Schema.TaggedErrorClass<JiraAuthError>()("JiraAuthError", {
  detail: Schema.String,
  status: Schema.optional(Schema.Number),
}) {
  override get message(): string {
    return `Jira authentication failed: ${this.detail}`;
  }
}

export class JiraNotFoundError extends Schema.TaggedErrorClass<JiraNotFoundError>()(
  "JiraNotFoundError",
  {
    resource: Schema.String,
  },
) {
  override get message(): string {
    return `Jira resource not found: ${this.resource}`;
  }
}

export class JiraRateLimitedError extends Schema.TaggedErrorClass<JiraRateLimitedError>()(
  "JiraRateLimitedError",
  {
    retryAfterMs: Schema.Number,
  },
) {
  override get message(): string {
    return `Jira rate limited; retry in ${this.retryAfterMs}ms`;
  }
}

export class JiraNetworkError extends Schema.TaggedErrorClass<JiraNetworkError>()(
  "JiraNetworkError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Jira request failed: ${this.detail}`;
  }
}

export class JiraDecodeError extends Schema.TaggedErrorClass<JiraDecodeError>()("JiraDecodeError", {
  detail: Schema.String,
}) {
  override get message(): string {
    return `Failed to decode Jira response: ${this.detail}`;
  }
}

export class JiraStorageError extends Schema.TaggedErrorClass<JiraStorageError>()(
  "JiraStorageError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Jira storage error: ${this.detail}`;
  }
}

export const JiraError = Schema.Union([
  JiraConfigError,
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitedError,
  JiraNetworkError,
  JiraDecodeError,
  JiraStorageError,
]);
export type JiraError = typeof JiraError.Type;
