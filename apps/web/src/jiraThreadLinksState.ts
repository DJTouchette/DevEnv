import type { JiraThreadLink, JiraThreadLinksStreamEvent, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { getPrimaryEnvironmentConnection } from "./environments/runtime";

interface JiraThreadLinksState {
  readonly links: ReadonlyMap<ThreadId, JiraThreadLink>;
  readonly applyEvent: (event: JiraThreadLinksStreamEvent) => void;
  readonly reset: () => void;
}

const useJiraThreadLinksStore = create<JiraThreadLinksState>((set) => ({
  links: new Map(),
  applyEvent: (event) =>
    set((current) => {
      const next = new Map(current.links);
      if (event.type === "snapshot") {
        next.clear();
        for (const link of event.links) {
          next.set(link.threadId, link);
        }
      } else if (event.change.type === "linked") {
        next.set(event.change.link.threadId, event.change.link);
      } else {
        next.delete(event.change.threadId);
      }
      return { ...current, links: next };
    }),
  reset: () => set((current) => ({ ...current, links: new Map() })),
}));

export function useLinkedJiraIssue(threadId: ThreadId | null | undefined): JiraThreadLink | null {
  return useJiraThreadLinksStore((store) =>
    threadId ? (store.links.get(threadId) ?? null) : null,
  );
}

export function getLinkedJiraIssue(threadId: ThreadId): JiraThreadLink | null {
  return useJiraThreadLinksStore.getState().links.get(threadId) ?? null;
}

// Returns all Jira links whose threadId is in the given set. Recomputed only
// when the underlying links map changes; the threadIds set is captured by
// reference so callers should memoize it (e.g. via useMemo over a stable list).
export function useLinkedJiraIssuesForThreads(threadIds: ReadonlySet<ThreadId>): JiraThreadLink[] {
  return useJiraThreadLinksStore(
    useShallow((store) => {
      const result: JiraThreadLink[] = [];
      for (const id of threadIds) {
        const link = store.links.get(id);
        if (link) result.push(link);
      }
      return result;
    }),
  );
}

let unsubscribe: (() => void) | null = null;

export function startJiraThreadLinksSubscription(): void {
  if (unsubscribe !== null) return;
  try {
    unsubscribe = getPrimaryEnvironmentConnection().client.jira.subscribeThreadLinks(
      (event) => {
        useJiraThreadLinksStore.getState().applyEvent(event);
      },
      {
        onResubscribe: () => {
          useJiraThreadLinksStore.getState().reset();
        },
      },
    );
  } catch {
    // Subscription may fail before connection is ready; bootstrap re-runs on connection.
    unsubscribe = null;
  }
}

export function stopJiraThreadLinksSubscription(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
