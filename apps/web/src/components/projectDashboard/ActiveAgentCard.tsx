import type { EnvironmentId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback } from "react";

import { JiraLinkedIssueBadge } from "../jira/JiraLinkedIssueBadge";
import { AdoLinkedPrBadge } from "../azureDevOps/AdoLinkedPrBadge";
import { useNowTick } from "../../hooks/useNowTick";
import { buildThreadRouteParams } from "../../threadRoutes";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import type { SidebarThreadSummary } from "../../types";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import { useThreadDetailSnippet } from "./useThreadDetailSnippet";
import { isActiveThread } from "./selectors";

export const ActiveAgentCard = memo(function ActiveAgentCard(props: {
  readonly environmentId: EnvironmentId;
  readonly thread: SidebarThreadSummary;
}) {
  const { thread, environmentId } = props;
  const navigate = useNavigate();
  const active = isActiveThread(thread);
  const status = resolveThreadStatusPill({ thread });
  const snippet = useThreadDetailSnippet({
    environmentId,
    threadId: thread.id,
    enabled: active,
  });
  const startedAt = thread.latestTurn?.startedAt ?? null;
  const showTick = active && startedAt !== null;
  const now = useNowTick(1000, showTick);
  const elapsed = startedAt ? formatElapsedDurationLabel(startedAt, now) : null;

  const handleClick = useCallback(() => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, thread.id)),
    });
  }, [navigate, environmentId, thread.id]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full flex-col gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-3 text-left transition-colors hover:border-border hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{thread.title}</span>
          {thread.branch ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground/80">
              {thread.branch}
            </span>
          ) : null}
        </div>
        {status ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium ${status.colorClass}`}
          >
            <span
              className={`size-2 rounded-full ${status.dotClass} ${status.pulse ? "animate-pulse" : ""}`}
            />
            {status.label}
          </span>
        ) : null}
      </div>

      <div className="min-h-[2.25rem] text-xs leading-snug text-muted-foreground">
        {snippet.text ? (
          <span className={snippet.streaming ? "italic" : undefined}>{snippet.text}</span>
        ) : active ? (
          <span className="text-muted-foreground/60">Working…</span>
        ) : (
          <span className="text-muted-foreground/60">No recent agent message.</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <JiraLinkedIssueBadge threadId={thread.id} />
          <AdoLinkedPrBadge threadId={thread.id} />
        </div>
        {elapsed ? (
          <span className="font-mono text-[10px] text-muted-foreground">{elapsed}</span>
        ) : null}
      </div>
    </button>
  );
});
