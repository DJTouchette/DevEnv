import type { AdoPrThreadLink, AdoPrThreadLinksStreamEvent, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { getPrimaryEnvironmentConnection } from "./environments/runtime";

interface AdoThreadLinksState {
  readonly links: ReadonlyMap<ThreadId, AdoPrThreadLink>;
  readonly applyEvent: (event: AdoPrThreadLinksStreamEvent) => void;
  readonly reset: () => void;
}

const useAdoThreadLinksStore = create<AdoThreadLinksState>((set) => ({
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

export function useLinkedAdoPullRequest(
  threadId: ThreadId | null | undefined,
): AdoPrThreadLink | null {
  return useAdoThreadLinksStore((store) => (threadId ? (store.links.get(threadId) ?? null) : null));
}

export function getLinkedAdoPullRequest(threadId: ThreadId): AdoPrThreadLink | null {
  return useAdoThreadLinksStore.getState().links.get(threadId) ?? null;
}

// See `useLinkedJiraIssuesForThreads` for behavior. Caller should memoize
// the threadIds set to keep results stable across renders.
export function useLinkedAdoPullRequestsForThreads(
  threadIds: ReadonlySet<ThreadId>,
): AdoPrThreadLink[] {
  return useAdoThreadLinksStore(
    useShallow((store) => {
      const result: AdoPrThreadLink[] = [];
      for (const id of threadIds) {
        const link = store.links.get(id);
        if (link) result.push(link);
      }
      return result;
    }),
  );
}

let unsubscribe: (() => void) | null = null;

export function startAdoThreadLinksSubscription(): void {
  if (unsubscribe !== null) return;
  try {
    unsubscribe = getPrimaryEnvironmentConnection().client.ado.subscribePrThreadLinks(
      (event) => {
        useAdoThreadLinksStore.getState().applyEvent(event);
      },
      {
        onResubscribe: () => {
          useAdoThreadLinksStore.getState().reset();
        },
      },
    );
  } catch {
    unsubscribe = null;
  }
}

export function stopAdoThreadLinksSubscription(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
