import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { retainThreadDetailSubscription } from "../../environments/runtime/service";
import { selectEnvironmentState, useStore, type AppState } from "../../store";
import { selectLatestAssistantSnippet } from "./selectors";

export interface ThreadDetailSnippetState {
  readonly text: string | null;
  readonly streaming: boolean;
}

// Retains a refcounted detail subscription via the existing registry while
// `enabled` is true, then reads the latest assistant message text from the
// store. The registry deduplicates with any other subscriber (e.g. the open
// thread route) and evicts when refcount drops to zero and the thread is
// idle, so callers can safely flip `enabled` based on per-thread liveness.
export function useThreadDetailSnippet(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  enabled: boolean;
}): ThreadDetailSnippetState {
  const { environmentId, threadId, enabled } = input;

  useEffect(() => {
    if (!enabled) return;
    return retainThreadDetailSubscription(environmentId, threadId);
  }, [enabled, environmentId, threadId]);

  const selector = useMemo(
    () =>
      (state: AppState): ThreadDetailSnippetState => {
        const env = selectEnvironmentState(state, environmentId);
        const messageIds = env.messageIdsByThreadId[threadId] ?? [];
        const messageById = env.messageByThreadId[threadId] ?? {};
        const result = selectLatestAssistantSnippet({ messageIds, messageById });
        if (!result) return { text: null, streaming: false };
        return { text: result.text, streaming: result.streaming };
      },
    [environmentId, threadId],
  );

  return useStore(useShallow(selector));
}
