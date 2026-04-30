import { memo } from "react";

import type { SidebarThreadSummary } from "../../types";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { computeDashboardStats } from "./selectors";

export const ProjectDashboardStats = memo(function ProjectDashboardStats(props: {
  readonly threads: ReadonlyArray<SidebarThreadSummary>;
}) {
  const stats = computeDashboardStats(props.threads);
  const lastActivity = stats.lastActivityAt ? formatRelativeTimeLabel(stats.lastActivityAt) : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Total threads" value={String(stats.total)} />
      <StatTile label="Active" value={String(stats.active)} accent={stats.active > 0} />
      <StatTile
        label="Awaiting input"
        value={String(stats.awaitingInput)}
        accent={stats.awaitingInput > 0}
      />
      <StatTile
        label="Pending approvals"
        value={String(stats.pendingApprovals)}
        accent={stats.pendingApprovals > 0}
      />
      <StatTile label="Branches" value={String(stats.branches)} />
      <StatTile label="Last activity" value={lastActivity} />
    </div>
  );
});

function StatTile(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground/70">
        {props.label}
      </span>
      <span
        className={`font-mono text-lg font-semibold ${props.accent ? "text-sky-600 dark:text-sky-300" : "text-foreground"}`}
      >
        {props.value}
      </span>
    </div>
  );
}
