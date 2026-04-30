import type { JiraThreadLink, JiraThreadLinksStreamEvent, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

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
