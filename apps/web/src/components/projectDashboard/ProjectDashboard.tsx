import type { ScopedProjectRef } from "@t3tools/contracts";
import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { ProjectDashboardActiveAgents } from "./ProjectDashboardActiveAgents";
import { ProjectDashboardAdoPanel } from "./ProjectDashboardAdoPanel";
import { ProjectDashboardJiraPanel } from "./ProjectDashboardJiraPanel";
import { ProjectDashboardStats } from "./ProjectDashboardStats";
import { selectAllThreadIds } from "./selectors";
import { ProjectFavicon } from "../ProjectFavicon";
import { isElectron } from "../../env";
import { derivePhysicalProjectKey } from "../../logicalProject";
import { selectSidebarThreadsForProjectRefs, useStore } from "../../store";
import type { Project } from "../../types";
import { cn } from "../../lib/utils";
import { SidebarInset, SidebarTrigger } from "../ui/sidebar";

export const ProjectDashboard = memo(function ProjectDashboard(props: {
  readonly project: Project;
  readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef>;
}) {
  const { project, memberProjectRefs } = props;
  const projectKey = useMemo(() => derivePhysicalProjectKey(project), [project]);

  const sidebarThreads = useStore(
    useShallow((state) => selectSidebarThreadsForProjectRefs(state, memberProjectRefs)),
  );

  const threadIds = useMemo(() => selectAllThreadIds(sidebarThreads), [sidebarThreads]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <header
          className={cn(
            "border-b border-border px-4 sm:px-6",
            isElectron
              ? "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]"
              : "flex items-center py-3",
          )}
        >
          <div className="flex w-full items-center gap-3 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
            {!isElectron ? <SidebarTrigger className="size-7 shrink-0 md:hidden" /> : null}
            <ProjectFavicon environmentId={project.environmentId} cwd={project.cwd} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">{project.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground/70">
                {project.cwd}
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6">
          <ProjectDashboardStats threads={sidebarThreads} />
          <ProjectDashboardActiveAgents
            environmentId={project.environmentId}
            threads={sidebarThreads}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectDashboardJiraPanel projectKey={projectKey} threadIds={threadIds} />
            <ProjectDashboardAdoPanel projectKey={projectKey} threadIds={threadIds} />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
});
