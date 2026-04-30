import type { EnvironmentId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useMemo } from "react";

import { ActiveAgentCard } from "./ActiveAgentCard";
import { isActiveThread } from "./selectors";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import type { SidebarThreadSummary } from "../../types";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";

export const ProjectDashboardActiveAgents = memo(function ProjectDashboardActiveAgents(props: {
  readonly environmentId: EnvironmentId;
  readonly threads: ReadonlyArray<SidebarThreadSummary>;
}) {
  const { environmentId, threads } = props;
  const { active, idle } = useMemo(() => {
    const activeList: SidebarThreadSummary[] = [];
    const idleList: SidebarThreadSummary[] = [];
    for (const thread of threads) {
      (isActiveThread(thread) ? activeList : idleList).push(thread);
    }
    return { active: activeList, idle: idleList };
  }, [threads]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Active agents"
          subtitle={
            active.length === 0
              ? "No agents currently running."
              : `${active.length} agent${active.length === 1 ? "" : "s"} working.`
          }
        />
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/20 px-4 py-6 text-center text-sm text-muted-foreground/70">
            Start a thread to see live agent activity here.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((thread) => (
              <ActiveAgentCard key={thread.id} environmentId={environmentId} thread={thread} />
            ))}
          </div>
        )}
      </section>

      {idle.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Recent threads"
            subtitle={`${idle.length} idle thread${idle.length === 1 ? "" : "s"}.`}
          />
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card/20">
            {idle.slice(0, 12).map((thread) => (
              <IdleThreadRow key={thread.id} environmentId={environmentId} thread={thread} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
});

function SectionHeader(props: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-heading text-sm font-semibold text-foreground">{props.title}</h2>
      {props.subtitle ? (
        <span className="text-xs text-muted-foreground/70">{props.subtitle}</span>
      ) : null}
    </div>
  );
}

const IdleThreadRow = memo(function IdleThreadRow(props: {
  readonly environmentId: EnvironmentId;
  readonly thread: SidebarThreadSummary;
}) {
  const { environmentId, thread } = props;
  const navigate = useNavigate();
  const status = resolveThreadStatusPill({ thread });
  const lastTimestamp =
    thread.latestTurn?.completedAt ??
    thread.latestUserMessageAt ??
    thread.updatedAt ??
    thread.createdAt;
  const handleClick = useCallback(() => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, thread.id)),
    });
  }, [navigate, environmentId, thread.id]);

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-hidden"
      >
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
        {thread.branch ? (
          <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
            {thread.branch}
          </span>
        ) : null}
        {status ? (
          <span className={`shrink-0 text-[10px] ${status.colorClass}`}>{status.label}</span>
        ) : null}
        {lastTimestamp ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {formatRelativeTimeLabel(lastTimestamp)}
          </span>
        ) : null}
      </button>
    </li>
  );
});
