import {
  type AdoActiveBuildsStreamEvent,
  type AdoBuild,
  type AdoBuildId,
  type AdoProjectId,
} from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { getPrimaryEnvironmentConnection } from "~/environments/runtime";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

export interface AdoActiveBuildsState {
  readonly builds: ReadonlyArray<AdoBuild>;
  readonly subscribed: boolean;
  readonly error: string | null;
}

// Subscribes to `subscribeActiveBuilds` while `enabled` is true. When
// `projectIds` is provided the subscription is server-filtered; passing
// `undefined` falls back to the user's globally watched projects.
export function useAdoActiveBuilds(input: {
  readonly enabled: boolean;
  readonly projectIds?: ReadonlyArray<AdoProjectId> | undefined;
}): AdoActiveBuildsState {
  const { enabled, projectIds } = input;
  const projectIdsKey = projectIds ? projectIds.join("|") : null;
  const [builds, setBuilds] = useState<ReadonlyMap<AdoBuildId, AdoBuild>>(new Map());
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBuilds(new Map());
      setSubscribed(false);
      setError(null);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = getPrimaryEnvironmentConnection().client.ado.subscribeActiveBuilds(
        projectIds ? { projectIds } : {},
        (event: AdoActiveBuildsStreamEvent) => {
          if (cancelled) return;
          setError(null);
          setSubscribed(true);
          setBuilds((current) => {
            const next = new Map(current);
            switch (event.type) {
              case "snapshot":
                next.clear();
                for (const build of event.builds) next.set(build.id, build);
                return next;
              case "upsert":
                next.set(event.build.id, event.build);
                return next;
              case "removed":
                next.delete(event.buildId);
                return next;
              case "error":
                setError(event.detail);
                return current;
              default:
                return current;
            }
          });
        },
        {
          onResubscribe: () => {
            if (!cancelled) setBuilds(new Map());
          },
        },
      );
    } catch (cause) {
      setError(errorDetail(cause));
    }
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // projectIdsKey captures the array's contents; React doesn't structurally
    // diff arrays, so reconstructing the dependency from a string keeps the
    // effect stable when callers pass a fresh array of equivalent values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectIdsKey]);

  const sortedBuilds = useMemo(
    () =>
      Array.from(builds.values()).toSorted((a, b) => {
        const at = a.startTime ?? a.queueTime ?? "";
        const bt = b.startTime ?? b.queueTime ?? "";
        return bt.localeCompare(at);
      }),
    [builds],
  );

  return { builds: sortedBuilds, subscribed, error };
}
