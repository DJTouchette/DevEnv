import { scopeProjectRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";

import { isActiveThread } from "../Sidebar.logic";
import {
  deriveLogicalProjectKeyFromSettings,
  type ProjectGroupingSettings,
} from "../../logicalProject";
import type { Project, SidebarThreadSummary } from "../../types";

export { isActiveThread };

// Resolves the set of project refs the dashboard should aggregate over.
// When the project's logical key matches sibling projects (per the user's
// grouping settings), include all members so the dashboard mirrors the
// grouped sidebar row. Falls back to just this project's ref otherwise.
export function deriveSiblingProjectRefs(input: {
  project: Project;
  allProjects: ReadonlyArray<Project>;
  settings: ProjectGroupingSettings;
}): ScopedProjectRef[] {
  const { project, allProjects, settings } = input;
  const targetKey = deriveLogicalProjectKeyFromSettings(project, settings);
  const refs: ScopedProjectRef[] = [];
  const seen = new Set<string>();
  for (const candidate of allProjects) {
    if (deriveLogicalProjectKeyFromSettings(candidate, settings) !== targetKey) continue;
    const key = `${candidate.environmentId}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(scopeProjectRef(candidate.environmentId, candidate.id));
  }
  if (refs.length === 0) {
    refs.push(scopeProjectRef(project.environmentId, project.id));
  }
  return refs;
}

export interface DashboardThreadStats {
  total: number;
  active: number;
  awaitingInput: number;
  pendingApprovals: number;
  branches: number;
  worktrees: number;
  lastActivityAt: string | null;
}

export function computeDashboardStats(
  threads: ReadonlyArray<SidebarThreadSummary>,
): DashboardThreadStats {
  let active = 0;
  let awaitingInput = 0;
  let pendingApprovals = 0;
  const branches = new Set<string>();
  const worktrees = new Set<string>();
  let lastActivity: number | null = null;
  for (const thread of threads) {
    if (isActiveThread(thread)) active += 1;
    if (thread.hasPendingUserInput) awaitingInput += 1;
    if (thread.hasPendingApprovals) pendingApprovals += 1;
    if (thread.branch) branches.add(thread.branch);
    if (thread.worktreePath) worktrees.add(thread.worktreePath);
    const candidate =
      thread.latestTurn?.completedAt ??
      thread.latestTurn?.startedAt ??
      thread.latestUserMessageAt ??
      thread.updatedAt ??
      thread.createdAt;
    if (candidate) {
      const ms = Date.parse(candidate);
      if (!Number.isNaN(ms) && (lastActivity === null || ms > lastActivity)) {
        lastActivity = ms;
      }
    }
  }
  return {
    total: threads.length,
    active,
    awaitingInput,
    pendingApprovals,
    branches: branches.size,
    worktrees: worktrees.size,
    lastActivityAt: lastActivity !== null ? new Date(lastActivity).toISOString() : null,
  };
}

export function selectActiveThreadIds(
  threads: ReadonlyArray<SidebarThreadSummary>,
): ReadonlySet<ThreadId> {
  const set = new Set<ThreadId>();
  for (const thread of threads) {
    if (isActiveThread(thread)) set.add(thread.id);
  }
  return set;
}

export function selectAllThreadIds(
  threads: ReadonlyArray<SidebarThreadSummary>,
): ReadonlySet<ThreadId> {
  const set = new Set<ThreadId>();
  for (const thread of threads) set.add(thread.id);
  return set;
}

// Helper for "last assistant message snippet" given the store's per-thread
// message map. Returns a single-line preview truncated to `maxChars`.
export function selectLatestAssistantSnippet(input: {
  messageIds: ReadonlyArray<string>;
  messageById: Record<string, { role: string; text: string; streaming: boolean }>;
  maxChars?: number;
}): { text: string; streaming: boolean } | null {
  const { messageIds, messageById, maxChars = 280 } = input;
  for (let index = messageIds.length - 1; index >= 0; index -= 1) {
    const messageId = messageIds[index];
    if (!messageId) continue;
    const message = messageById[messageId];
    if (!message || message.role !== "assistant") continue;
    const text = message.text.replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    return {
      text: text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text,
      streaming: message.streaming,
    };
  }
  return null;
}

// Subscription cache key — used to keep snippet state stable per thread.
export function dashboardThreadKey(environmentId: EnvironmentId, threadId: ThreadId): string {
  return `${environmentId}:${threadId}`;
}
