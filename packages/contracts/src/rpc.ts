import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { OpenError, OpenInEditorInput } from "./editor.ts";
import { AuthAccessStreamEvent } from "./auth.ts";
import {
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  FilesystemBrowseError,
} from "./filesystem.ts";
import {
  GitActionProgressEvent,
  GitCheckoutInput,
  GitCheckoutResult,
  GitCommandError,
  GitCreateBranchInput,
  GitCreateBranchResult,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitManagerServiceError,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullInput,
  GitPullRequestRefInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitStatusInput,
  GitStatusResult,
  GitStatusStreamEvent,
} from "./git.ts";
import {
  JiraAddCommentInput,
  JiraAuthError,
  JiraComment,
  JiraConfigError,
  JiraCredentialsSnapshot,
  JiraDecodeError,
  JiraGetIssueInput,
  JiraGetThreadLinkInput,
  JiraIssue,
  JiraIssueCreateInput,
  JiraLinkThreadInput,
  JiraListCommentsInput,
  JiraListTransitionsInput,
  JiraNetworkError,
  JiraNotFoundError,
  JiraRateLimitedError,
  JiraSearchInput,
  JiraSearchPage,
  JiraSetCredentialsInput,
  JiraStorageError,
  JiraThreadLink,
  JiraThreadLinksStreamEvent,
  JiraTransition,
  JiraTransitionIssueInput,
  JiraUnlinkThreadInput,
  JiraUser,
} from "./jira.ts";
import {
  AdoActiveBuildsStreamEvent,
  AdoAddPullRequestCommentInput,
  AdoAuthError,
  AdoBuildLogStreamEvent,
  AdoBuildTimeline,
  AdoConfigError,
  AdoCredentialsSnapshot,
  AdoDecodeError,
  AdoGetBuildTimelineInput,
  AdoGetPrThreadLinkInput,
  AdoGetPullRequestInput,
  AdoLinkPrThreadInput,
  AdoListPullRequestCommentsInput,
  AdoListRecentBuildsInput,
  AdoListRecentBuildsResult,
  AdoNetworkError,
  AdoNotFoundError,
  AdoPrThreadLink,
  AdoPrThreadLinksStreamEvent,
  AdoProject,
  AdoPullRequest,
  AdoPullRequestComment,
  AdoRateLimitedError,
  AdoSearchPullRequestsInput,
  AdoSearchPullRequestsPage,
  AdoSetCredentialsInput,
  AdoSetWatchedProjectsInput,
  AdoStorageError,
  AdoSubscribeActiveBuildsInput,
  AdoSubscribeBuildLogInput,
  AdoUnlinkPrThreadInput,
} from "./azureDevOps.ts";
import { KeybindingsConfigError } from "./keybindings.ts";
import {
  ClientOrchestrationCommand,
  ORCHESTRATION_WS_METHODS,
  OrchestrationDispatchCommandError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsError,
  OrchestrationReplayEventsInput,
  OrchestrationRpcSchemas,
} from "./orchestration.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import {
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project.ts";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalError,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal.ts";
import {
  ServerConfigStreamEvent,
  ServerConfig,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "./settings.ts";

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Filesystem methods
  filesystemBrowse: "filesystem.browse",

  // Git methods
  gitPull: "git.pull",
  gitRefreshStatus: "git.refreshStatus",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitInit: "git.init",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",

  // Jira methods
  jiraGetCredentials: "jira.getCredentials",
  jiraSetCredentials: "jira.setCredentials",
  jiraClearCredentials: "jira.clearCredentials",
  jiraSearch: "jira.search",
  jiraGetIssue: "jira.getIssue",
  jiraCreateIssue: "jira.createIssue",
  jiraListTransitions: "jira.listTransitions",
  jiraTransitionIssue: "jira.transitionIssue",
  jiraAddComment: "jira.addComment",
  jiraCurrentUser: "jira.currentUser",
  jiraLinkThread: "jira.linkThread",
  jiraUnlinkThread: "jira.unlinkThread",
  jiraGetThreadLink: "jira.getThreadLink",
  jiraListComments: "jira.listComments",

  // Azure DevOps methods
  adoGetCredentials: "ado.getCredentials",
  adoSetCredentials: "ado.setCredentials",
  adoClearCredentials: "ado.clearCredentials",
  adoListProjects: "ado.listProjects",
  adoSetWatchedProjects: "ado.setWatchedProjects",
  adoSearchPullRequests: "ado.searchPullRequests",
  adoGetPullRequest: "ado.getPullRequest",
  adoAddPullRequestComment: "ado.addPullRequestComment",
  adoLinkPrThread: "ado.linkPrThread",
  adoUnlinkPrThread: "ado.unlinkPrThread",
  adoGetPrThreadLink: "ado.getPrThreadLink",
  adoGetBuildTimeline: "ado.getBuildTimeline",
  adoListPullRequestComments: "ado.listPullRequestComments",
  adoListRecentBuilds: "ado.listRecentBuilds",

  // Streaming subscriptions
  subscribeGitStatus: "subscribeGitStatus",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeAuthAccess: "subscribeAuthAccess",
  subscribeJiraThreadLinks: "subscribeJiraThreadLinks",
  subscribeAdoPrThreadLinks: "subscribeAdoPrThreadLinks",
  subscribeAdoActiveBuilds: "subscribeAdoActiveBuilds",
  subscribeAdoBuildLog: "subscribeAdoBuildLog",
} as const;

export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: KeybindingsConfigError,
});

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
});

export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({
    /**
     * When supplied, only refresh this specific provider instance. When
     * omitted, refresh all configured instances — the legacy `refresh()`
     * behaviour retained for transports that still dispatch untargeted
     * refreshes.
     */
    instanceId: Schema.optional(ProviderInstanceId),
  }),
  success: ServerProviderUpdatedPayload,
});

export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: Schema.Struct({ patch: ServerSettingsPatch }),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: ProjectSearchEntriesError,
});

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: ProjectWriteFileError,
});

export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: OpenInEditorInput,
  error: OpenError,
});

export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: FilesystemBrowseError,
});

export const WsSubscribeGitStatusRpc = Rpc.make(WS_METHODS.subscribeGitStatus, {
  payload: GitStatusInput,
  success: GitStatusStreamEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsGitPullRpc = Rpc.make(WS_METHODS.gitPull, {
  payload: GitPullInput,
  success: GitPullResult,
  error: GitCommandError,
});

export const WsGitRefreshStatusRpc = Rpc.make(WS_METHODS.gitRefreshStatus, {
  payload: GitStatusInput,
  success: GitStatusResult,
  error: GitManagerServiceError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: GitManagerServiceError,
});

export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: GitManagerServiceError,
});

export const WsGitListBranchesRpc = Rpc.make(WS_METHODS.gitListBranches, {
  payload: GitListBranchesInput,
  success: GitListBranchesResult,
  error: GitCommandError,
});

export const WsGitCreateWorktreeRpc = Rpc.make(WS_METHODS.gitCreateWorktree, {
  payload: GitCreateWorktreeInput,
  success: GitCreateWorktreeResult,
  error: GitCommandError,
});

export const WsGitRemoveWorktreeRpc = Rpc.make(WS_METHODS.gitRemoveWorktree, {
  payload: GitRemoveWorktreeInput,
  error: GitCommandError,
});

export const WsGitCreateBranchRpc = Rpc.make(WS_METHODS.gitCreateBranch, {
  payload: GitCreateBranchInput,
  success: GitCreateBranchResult,
  error: GitCommandError,
});

export const WsGitCheckoutRpc = Rpc.make(WS_METHODS.gitCheckout, {
  payload: GitCheckoutInput,
  success: GitCheckoutResult,
  error: GitCommandError,
});

export const WsGitInitRpc = Rpc.make(WS_METHODS.gitInit, {
  payload: GitInitInput,
  error: GitCommandError,
});

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  error: TerminalError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  error: TerminalError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  error: TerminalError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  error: TerminalError,
});

export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: OrchestrationDispatchCommandError,
  },
);

export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationGetTurnDiffInput,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: OrchestrationGetTurnDiffError,
});

export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationGetFullThreadDiffInput,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: OrchestrationGetFullThreadDiffError,
  },
);

export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationReplayEventsInput,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: OrchestrationReplayEventsError,
});

export const WsOrchestrationSubscribeShellRpc = Rpc.make(ORCHESTRATION_WS_METHODS.subscribeShell, {
  payload: OrchestrationRpcSchemas.subscribeShell.input,
  success: OrchestrationRpcSchemas.subscribeShell.output,
  error: OrchestrationGetSnapshotError,
  stream: true,
});

export const WsOrchestrationSubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.subscribeThread,
  {
    payload: OrchestrationRpcSchemas.subscribeThread.input,
    success: OrchestrationRpcSchemas.subscribeThread.output,
    error: OrchestrationGetSnapshotError,
    stream: true,
  },
);

export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
  stream: true,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  stream: true,
});

export const WsSubscribeAuthAccessRpc = Rpc.make(WS_METHODS.subscribeAuthAccess, {
  payload: Schema.Struct({}),
  success: AuthAccessStreamEvent,
  stream: true,
});

const JiraReadError = Schema.Union([
  JiraConfigError,
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitedError,
  JiraNetworkError,
  JiraDecodeError,
]);

const JiraWriteError = Schema.Union([
  JiraConfigError,
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitedError,
  JiraNetworkError,
  JiraDecodeError,
  JiraStorageError,
]);

export const WsJiraGetCredentialsRpc = Rpc.make(WS_METHODS.jiraGetCredentials, {
  payload: Schema.Struct({}),
  success: JiraCredentialsSnapshot,
  error: JiraStorageError,
});

export const WsJiraSetCredentialsRpc = Rpc.make(WS_METHODS.jiraSetCredentials, {
  payload: JiraSetCredentialsInput,
  success: JiraCredentialsSnapshot,
  error: JiraStorageError,
});

export const WsJiraClearCredentialsRpc = Rpc.make(WS_METHODS.jiraClearCredentials, {
  payload: Schema.Struct({}),
  success: JiraCredentialsSnapshot,
  error: JiraStorageError,
});

export const WsJiraSearchRpc = Rpc.make(WS_METHODS.jiraSearch, {
  payload: JiraSearchInput,
  success: JiraSearchPage,
  error: JiraReadError,
});

export const WsJiraGetIssueRpc = Rpc.make(WS_METHODS.jiraGetIssue, {
  payload: JiraGetIssueInput,
  success: JiraIssue,
  error: JiraReadError,
});

export const WsJiraCreateIssueRpc = Rpc.make(WS_METHODS.jiraCreateIssue, {
  payload: JiraIssueCreateInput,
  success: JiraIssue,
  error: JiraWriteError,
});

export const WsJiraListTransitionsRpc = Rpc.make(WS_METHODS.jiraListTransitions, {
  payload: JiraListTransitionsInput,
  success: Schema.Array(JiraTransition),
  error: JiraReadError,
});

export const WsJiraTransitionIssueRpc = Rpc.make(WS_METHODS.jiraTransitionIssue, {
  payload: JiraTransitionIssueInput,
  success: Schema.Struct({ ok: Schema.Literal(true) }),
  error: JiraWriteError,
});

export const WsJiraAddCommentRpc = Rpc.make(WS_METHODS.jiraAddComment, {
  payload: JiraAddCommentInput,
  success: JiraComment,
  error: JiraWriteError,
});

export const WsJiraCurrentUserRpc = Rpc.make(WS_METHODS.jiraCurrentUser, {
  payload: Schema.Struct({}),
  success: JiraUser,
  error: JiraReadError,
});

export const WsJiraLinkThreadRpc = Rpc.make(WS_METHODS.jiraLinkThread, {
  payload: JiraLinkThreadInput,
  success: JiraThreadLink,
  error: JiraStorageError,
});

export const WsJiraUnlinkThreadRpc = Rpc.make(WS_METHODS.jiraUnlinkThread, {
  payload: JiraUnlinkThreadInput,
  success: Schema.Struct({ ok: Schema.Literal(true) }),
  error: JiraStorageError,
});

export const WsJiraGetThreadLinkRpc = Rpc.make(WS_METHODS.jiraGetThreadLink, {
  payload: JiraGetThreadLinkInput,
  success: Schema.NullOr(JiraThreadLink),
  error: JiraStorageError,
});

export const WsJiraListCommentsRpc = Rpc.make(WS_METHODS.jiraListComments, {
  payload: JiraListCommentsInput,
  success: Schema.Array(JiraComment),
  error: JiraReadError,
});

export const WsSubscribeJiraThreadLinksRpc = Rpc.make(WS_METHODS.subscribeJiraThreadLinks, {
  payload: Schema.Struct({}),
  success: JiraThreadLinksStreamEvent,
  error: JiraStorageError,
  stream: true,
});

const AdoReadError = Schema.Union([
  AdoConfigError,
  AdoAuthError,
  AdoNotFoundError,
  AdoRateLimitedError,
  AdoNetworkError,
  AdoDecodeError,
]);

const AdoWriteError = Schema.Union([
  AdoConfigError,
  AdoAuthError,
  AdoNotFoundError,
  AdoRateLimitedError,
  AdoNetworkError,
  AdoDecodeError,
  AdoStorageError,
]);

export const WsAdoGetCredentialsRpc = Rpc.make(WS_METHODS.adoGetCredentials, {
  payload: Schema.Struct({}),
  success: AdoCredentialsSnapshot,
  error: AdoStorageError,
});

export const WsAdoSetCredentialsRpc = Rpc.make(WS_METHODS.adoSetCredentials, {
  payload: AdoSetCredentialsInput,
  success: AdoCredentialsSnapshot,
  error: AdoStorageError,
});

export const WsAdoClearCredentialsRpc = Rpc.make(WS_METHODS.adoClearCredentials, {
  payload: Schema.Struct({}),
  success: AdoCredentialsSnapshot,
  error: AdoStorageError,
});

export const WsAdoListProjectsRpc = Rpc.make(WS_METHODS.adoListProjects, {
  payload: Schema.Struct({}),
  success: Schema.Array(AdoProject),
  error: AdoReadError,
});

export const WsAdoSetWatchedProjectsRpc = Rpc.make(WS_METHODS.adoSetWatchedProjects, {
  payload: AdoSetWatchedProjectsInput,
  success: AdoCredentialsSnapshot,
  error: AdoStorageError,
});

export const WsAdoSearchPullRequestsRpc = Rpc.make(WS_METHODS.adoSearchPullRequests, {
  payload: AdoSearchPullRequestsInput,
  success: AdoSearchPullRequestsPage,
  error: AdoReadError,
});

export const WsAdoGetPullRequestRpc = Rpc.make(WS_METHODS.adoGetPullRequest, {
  payload: AdoGetPullRequestInput,
  success: AdoPullRequest,
  error: AdoReadError,
});

export const WsAdoAddPullRequestCommentRpc = Rpc.make(WS_METHODS.adoAddPullRequestComment, {
  payload: AdoAddPullRequestCommentInput,
  success: AdoPullRequestComment,
  error: AdoWriteError,
});

export const WsAdoLinkPrThreadRpc = Rpc.make(WS_METHODS.adoLinkPrThread, {
  payload: AdoLinkPrThreadInput,
  success: AdoPrThreadLink,
  error: Schema.Union([AdoStorageError, AdoReadError]),
});

export const WsAdoUnlinkPrThreadRpc = Rpc.make(WS_METHODS.adoUnlinkPrThread, {
  payload: AdoUnlinkPrThreadInput,
  success: Schema.Struct({ ok: Schema.Literal(true) }),
  error: AdoStorageError,
});

export const WsAdoGetPrThreadLinkRpc = Rpc.make(WS_METHODS.adoGetPrThreadLink, {
  payload: AdoGetPrThreadLinkInput,
  success: Schema.NullOr(AdoPrThreadLink),
  error: AdoStorageError,
});

export const WsAdoGetBuildTimelineRpc = Rpc.make(WS_METHODS.adoGetBuildTimeline, {
  payload: AdoGetBuildTimelineInput,
  success: AdoBuildTimeline,
  error: AdoReadError,
});

export const WsAdoListPullRequestCommentsRpc = Rpc.make(WS_METHODS.adoListPullRequestComments, {
  payload: AdoListPullRequestCommentsInput,
  success: Schema.Array(AdoPullRequestComment),
  error: AdoReadError,
});

export const WsAdoListRecentBuildsRpc = Rpc.make(WS_METHODS.adoListRecentBuilds, {
  payload: AdoListRecentBuildsInput,
  success: AdoListRecentBuildsResult,
  error: AdoReadError,
});

export const WsSubscribeAdoPrThreadLinksRpc = Rpc.make(WS_METHODS.subscribeAdoPrThreadLinks, {
  payload: Schema.Struct({}),
  success: AdoPrThreadLinksStreamEvent,
  error: AdoStorageError,
  stream: true,
});

export const WsSubscribeAdoActiveBuildsRpc = Rpc.make(WS_METHODS.subscribeAdoActiveBuilds, {
  payload: AdoSubscribeActiveBuildsInput,
  success: AdoActiveBuildsStreamEvent,
  error: AdoReadError,
  stream: true,
});

export const WsSubscribeAdoBuildLogRpc = Rpc.make(WS_METHODS.subscribeAdoBuildLog, {
  payload: AdoSubscribeBuildLogInput,
  success: AdoBuildLogStreamEvent,
  error: AdoReadError,
  stream: true,
});

export const WsRpcGroup = RpcGroup.make(
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpsertKeybindingRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsWriteFileRpc,
  WsShellOpenInEditorRpc,
  WsFilesystemBrowseRpc,
  WsSubscribeGitStatusRpc,
  WsGitPullRpc,
  WsGitRefreshStatusRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsGitListBranchesRpc,
  WsGitCreateWorktreeRpc,
  WsGitRemoveWorktreeRpc,
  WsGitCreateBranchRpc,
  WsGitCheckoutRpc,
  WsGitInitRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsSubscribeTerminalEventsRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeAuthAccessRpc,
  WsOrchestrationDispatchCommandRpc,
  WsOrchestrationGetTurnDiffRpc,
  WsOrchestrationGetFullThreadDiffRpc,
  WsOrchestrationReplayEventsRpc,
  WsOrchestrationSubscribeShellRpc,
  WsOrchestrationSubscribeThreadRpc,
  WsJiraGetCredentialsRpc,
  WsJiraSetCredentialsRpc,
  WsJiraClearCredentialsRpc,
  WsJiraSearchRpc,
  WsJiraGetIssueRpc,
  WsJiraCreateIssueRpc,
  WsJiraListTransitionsRpc,
  WsJiraTransitionIssueRpc,
  WsJiraAddCommentRpc,
  WsJiraCurrentUserRpc,
  WsJiraLinkThreadRpc,
  WsJiraUnlinkThreadRpc,
  WsJiraGetThreadLinkRpc,
  WsJiraListCommentsRpc,
  WsSubscribeJiraThreadLinksRpc,
  WsAdoGetCredentialsRpc,
  WsAdoSetCredentialsRpc,
  WsAdoClearCredentialsRpc,
  WsAdoListProjectsRpc,
  WsAdoSetWatchedProjectsRpc,
  WsAdoSearchPullRequestsRpc,
  WsAdoGetPullRequestRpc,
  WsAdoAddPullRequestCommentRpc,
  WsAdoLinkPrThreadRpc,
  WsAdoUnlinkPrThreadRpc,
  WsAdoGetPrThreadLinkRpc,
  WsAdoGetBuildTimelineRpc,
  WsAdoListPullRequestCommentsRpc,
  WsAdoListRecentBuildsRpc,
  WsSubscribeAdoPrThreadLinksRpc,
  WsSubscribeAdoActiveBuildsRpc,
  WsSubscribeAdoBuildLogRpc,
);
