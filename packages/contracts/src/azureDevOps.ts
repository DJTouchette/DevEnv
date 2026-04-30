/**
 * Azure DevOps contracts.
 *
 * Schemas, identifiers, and RPC errors shared by server and web for the Azure
 * DevOps integration. Auth is PAT-based (HTTP Basic with empty user). One
 * organisation, multiple projects; the user picks which projects the
 * pipelines panel watches.
 *
 * @module AzureDevOps
 */
import { Schema } from "effect";
import { TrimmedNonEmptyString, ThreadId } from "./baseSchemas.ts";

const TrimmedString = Schema.Trim;

export const AdoOrgUrl = TrimmedNonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^https?:\/\//)),
);
export type AdoOrgUrl = typeof AdoOrgUrl.Type;

export const AdoProjectId = TrimmedNonEmptyString.pipe(Schema.brand("AdoProjectId"));
export type AdoProjectId = typeof AdoProjectId.Type;

export const AdoRepositoryId = TrimmedNonEmptyString.pipe(Schema.brand("AdoRepositoryId"));
export type AdoRepositoryId = typeof AdoRepositoryId.Type;

export const AdoBuildId = TrimmedNonEmptyString.pipe(Schema.brand("AdoBuildId"));
export type AdoBuildId = typeof AdoBuildId.Type;

export const AdoCredentials = Schema.Struct({
  orgUrl: AdoOrgUrl,
  pat: TrimmedNonEmptyString,
});
export type AdoCredentials = typeof AdoCredentials.Type;

export const AdoCredentialsSnapshot = Schema.Struct({
  configured: Schema.Boolean,
  orgUrl: Schema.optional(AdoOrgUrl),
  watchedProjectIds: Schema.optional(Schema.Array(AdoProjectId)),
});
export type AdoCredentialsSnapshot = typeof AdoCredentialsSnapshot.Type;

export const AdoSetCredentialsInput = AdoCredentials;

export const AdoSetWatchedProjectsInput = Schema.Struct({
  projectIds: Schema.Array(AdoProjectId),
});
export type AdoSetWatchedProjectsInput = typeof AdoSetWatchedProjectsInput.Type;

export const AdoProject = Schema.Struct({
  id: AdoProjectId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  url: Schema.String,
});
export type AdoProject = typeof AdoProject.Type;

export const AdoUser = Schema.Struct({
  id: TrimmedNonEmptyString,
  displayName: Schema.String,
  uniqueName: Schema.optional(Schema.String),
});
export type AdoUser = typeof AdoUser.Type;

export const AdoPullRequestStatus = Schema.Literals(["active", "completed", "abandoned"]);
export type AdoPullRequestStatus = typeof AdoPullRequestStatus.Type;

export const AdoPullRequest = Schema.Struct({
  pullRequestId: Schema.Number,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: AdoPullRequestStatus,
  createdBy: Schema.optional(AdoUser),
  creationDate: Schema.optional(Schema.String),
  sourceRefName: Schema.optional(Schema.String),
  targetRefName: Schema.optional(Schema.String),
  repositoryId: AdoRepositoryId,
  repositoryName: Schema.String,
  projectId: AdoProjectId,
  projectName: Schema.String,
  url: Schema.String,
  isDraft: Schema.optional(Schema.Boolean),
  mergeStatus: Schema.optional(Schema.String),
});
export type AdoPullRequest = typeof AdoPullRequest.Type;

export const AdoSearchPullRequestsInput = Schema.Struct({
  query: Schema.optional(TrimmedString),
  projectId: Schema.optional(AdoProjectId),
  maxResults: Schema.optional(Schema.Number),
});
export type AdoSearchPullRequestsInput = typeof AdoSearchPullRequestsInput.Type;

export const AdoSearchPullRequestsPage = Schema.Struct({
  pullRequests: Schema.Array(AdoPullRequest),
});
export type AdoSearchPullRequestsPage = typeof AdoSearchPullRequestsPage.Type;

export const AdoGetPullRequestInput = Schema.Struct({
  projectId: AdoProjectId,
  repositoryId: AdoRepositoryId,
  pullRequestId: Schema.Number,
});
export type AdoGetPullRequestInput = typeof AdoGetPullRequestInput.Type;

export const AdoAddPullRequestCommentInput = Schema.Struct({
  projectId: AdoProjectId,
  repositoryId: AdoRepositoryId,
  pullRequestId: Schema.Number,
  body: TrimmedNonEmptyString,
});
export type AdoAddPullRequestCommentInput = typeof AdoAddPullRequestCommentInput.Type;

export const AdoPullRequestComment = Schema.Struct({
  id: Schema.Number,
  body: Schema.String,
  author: Schema.optional(AdoUser),
  publishedDate: Schema.optional(Schema.String),
});
export type AdoPullRequestComment = typeof AdoPullRequestComment.Type;

export const AdoListPullRequestCommentsInput = Schema.Struct({
  projectId: AdoProjectId,
  repositoryId: AdoRepositoryId,
  pullRequestId: Schema.Number,
});
export type AdoListPullRequestCommentsInput = typeof AdoListPullRequestCommentsInput.Type;

export const AdoBuildStatus = Schema.Literals([
  "none",
  "notStarted",
  "inProgress",
  "completing",
  "completed",
  "cancelling",
  "postponed",
]);
export type AdoBuildStatus = typeof AdoBuildStatus.Type;

export const AdoBuildResult = Schema.Literals([
  "none",
  "succeeded",
  "partiallySucceeded",
  "failed",
  "canceled",
]);
export type AdoBuildResult = typeof AdoBuildResult.Type;

export const AdoBuildDefinition = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});
export type AdoBuildDefinition = typeof AdoBuildDefinition.Type;

export const AdoBuild = Schema.Struct({
  id: AdoBuildId,
  buildNumber: Schema.String,
  status: AdoBuildStatus,
  result: Schema.optional(AdoBuildResult),
  startTime: Schema.optional(Schema.String),
  queueTime: Schema.optional(Schema.String),
  finishTime: Schema.optional(Schema.String),
  sourceBranch: Schema.optional(Schema.String),
  sourceVersion: Schema.optional(Schema.String),
  definition: AdoBuildDefinition,
  projectId: AdoProjectId,
  projectName: Schema.String,
  url: Schema.String,
  requestedFor: Schema.optional(AdoUser),
});
export type AdoBuild = typeof AdoBuild.Type;

export const AdoTimelineRecordState = Schema.Literals(["pending", "inProgress", "completed"]);
export type AdoTimelineRecordState = typeof AdoTimelineRecordState.Type;

export const AdoTimelineRecord = Schema.Struct({
  id: TrimmedNonEmptyString,
  parentId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  type: Schema.String,
  name: Schema.String,
  state: AdoTimelineRecordState,
  result: Schema.optional(AdoBuildResult),
  startTime: Schema.optional(Schema.String),
  finishTime: Schema.optional(Schema.String),
  percentComplete: Schema.optional(Schema.Number),
  errorCount: Schema.optional(Schema.Number),
  warningCount: Schema.optional(Schema.Number),
  logId: Schema.optional(Schema.Number),
  order: Schema.optional(Schema.Number),
});
export type AdoTimelineRecord = typeof AdoTimelineRecord.Type;

export const AdoBuildTimeline = Schema.Struct({
  buildId: AdoBuildId,
  records: Schema.Array(AdoTimelineRecord),
});
export type AdoBuildTimeline = typeof AdoBuildTimeline.Type;

export const AdoGetBuildTimelineInput = Schema.Struct({
  projectId: AdoProjectId,
  buildId: AdoBuildId,
});
export type AdoGetBuildTimelineInput = typeof AdoGetBuildTimelineInput.Type;

export const AdoBuildLogChunk = Schema.Struct({
  buildId: AdoBuildId,
  logId: Schema.Number,
  startLine: Schema.Number,
  endLine: Schema.Number,
  lines: Schema.Array(Schema.String),
  done: Schema.Boolean,
});
export type AdoBuildLogChunk = typeof AdoBuildLogChunk.Type;

export const AdoSubscribeActiveBuildsInput = Schema.Struct({
  projectIds: Schema.optional(Schema.Array(AdoProjectId)),
});
export type AdoSubscribeActiveBuildsInput = typeof AdoSubscribeActiveBuildsInput.Type;

export const AdoListRecentBuildsInput = Schema.Struct({
  projectId: AdoProjectId,
  maxResults: Schema.optional(Schema.Number),
});
export type AdoListRecentBuildsInput = typeof AdoListRecentBuildsInput.Type;

export const AdoListRecentBuildsResult = Schema.Struct({
  builds: Schema.Array(AdoBuild),
});
export type AdoListRecentBuildsResult = typeof AdoListRecentBuildsResult.Type;

export const AdoActiveBuildsStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    builds: Schema.Array(AdoBuild),
  }),
  Schema.Struct({
    type: Schema.Literal("upsert"),
    build: AdoBuild,
  }),
  Schema.Struct({
    type: Schema.Literal("removed"),
    buildId: AdoBuildId,
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    detail: Schema.String,
  }),
]);
export type AdoActiveBuildsStreamEvent = typeof AdoActiveBuildsStreamEvent.Type;

export const AdoSubscribeBuildLogInput = Schema.Struct({
  projectId: AdoProjectId,
  buildId: AdoBuildId,
  logId: Schema.Number,
  startLine: Schema.optional(Schema.Number),
});
export type AdoSubscribeBuildLogInput = typeof AdoSubscribeBuildLogInput.Type;

export const AdoBuildLogStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("chunk"),
    chunk: AdoBuildLogChunk,
  }),
  Schema.Struct({
    type: Schema.Literal("done"),
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    detail: Schema.String,
  }),
]);
export type AdoBuildLogStreamEvent = typeof AdoBuildLogStreamEvent.Type;

export const AdoPrThreadLink = Schema.Struct({
  threadId: ThreadId,
  projectId: AdoProjectId,
  projectName: Schema.String,
  repositoryId: AdoRepositoryId,
  pullRequestId: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  linkedAt: Schema.String,
});
export type AdoPrThreadLink = typeof AdoPrThreadLink.Type;

export const AdoPrThreadLinkSnapshot = Schema.Array(AdoPrThreadLink);
export type AdoPrThreadLinkSnapshot = typeof AdoPrThreadLinkSnapshot.Type;

export const AdoPrThreadLinkChange = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("linked"),
    link: AdoPrThreadLink,
  }),
  Schema.Struct({
    type: Schema.Literal("unlinked"),
    threadId: ThreadId,
  }),
]);
export type AdoPrThreadLinkChange = typeof AdoPrThreadLinkChange.Type;

export const AdoPrThreadLinksStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    links: AdoPrThreadLinkSnapshot,
  }),
  Schema.Struct({
    type: Schema.Literal("change"),
    change: AdoPrThreadLinkChange,
  }),
]);
export type AdoPrThreadLinksStreamEvent = typeof AdoPrThreadLinksStreamEvent.Type;

export const AdoLinkPrThreadInput = Schema.Struct({
  threadId: ThreadId,
  projectId: AdoProjectId,
  repositoryId: AdoRepositoryId,
  pullRequestId: Schema.Number,
});
export type AdoLinkPrThreadInput = typeof AdoLinkPrThreadInput.Type;

export const AdoUnlinkPrThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type AdoUnlinkPrThreadInput = typeof AdoUnlinkPrThreadInput.Type;

export const AdoGetPrThreadLinkInput = Schema.Struct({
  threadId: ThreadId,
});
export type AdoGetPrThreadLinkInput = typeof AdoGetPrThreadLinkInput.Type;

export class AdoConfigError extends Schema.TaggedErrorClass<AdoConfigError>()("AdoConfigError", {
  detail: Schema.String,
}) {
  override get message(): string {
    return `Azure DevOps is not configured: ${this.detail}`;
  }
}

export class AdoAuthError extends Schema.TaggedErrorClass<AdoAuthError>()("AdoAuthError", {
  detail: Schema.String,
  status: Schema.optional(Schema.Number),
}) {
  override get message(): string {
    return `Azure DevOps authentication failed: ${this.detail}`;
  }
}

export class AdoNotFoundError extends Schema.TaggedErrorClass<AdoNotFoundError>()(
  "AdoNotFoundError",
  {
    resource: Schema.String,
  },
) {
  override get message(): string {
    return `Azure DevOps resource not found: ${this.resource}`;
  }
}

export class AdoRateLimitedError extends Schema.TaggedErrorClass<AdoRateLimitedError>()(
  "AdoRateLimitedError",
  {
    retryAfterMs: Schema.Number,
  },
) {
  override get message(): string {
    return `Azure DevOps rate limited; retry in ${this.retryAfterMs}ms`;
  }
}

export class AdoNetworkError extends Schema.TaggedErrorClass<AdoNetworkError>()(
  "AdoNetworkError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Azure DevOps request failed: ${this.detail}`;
  }
}

export class AdoDecodeError extends Schema.TaggedErrorClass<AdoDecodeError>()("AdoDecodeError", {
  detail: Schema.String,
}) {
  override get message(): string {
    return `Failed to decode Azure DevOps response: ${this.detail}`;
  }
}

export class AdoStorageError extends Schema.TaggedErrorClass<AdoStorageError>()(
  "AdoStorageError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Azure DevOps storage error: ${this.detail}`;
  }
}

export const AdoError = Schema.Union([
  AdoConfigError,
  AdoAuthError,
  AdoNotFoundError,
  AdoRateLimitedError,
  AdoNetworkError,
  AdoDecodeError,
  AdoStorageError,
]);
export type AdoError = typeof AdoError.Type;
