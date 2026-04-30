import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { NoActiveThreadState } from "../components/NoActiveThreadState";
import { ProjectDashboard } from "../components/projectDashboard/ProjectDashboard";
import { deriveSiblingProjectRefs } from "../components/projectDashboard/selectors";
import { useSettings } from "../hooks/useSettings";
import { selectEnvironmentState, selectProjectsAcrossEnvironments, useStore } from "../store";
import { createProjectSelectorByRef } from "../storeSelectors";
import { useUiStateStore } from "../uiStateStore";
import { deriveLogicalProjectKeyFromSettings } from "../logicalProject";

export const Route = createFileRoute("/_chat/$environmentId/project/$projectId")({
  component: ProjectDashboardRouteView,
});

function ProjectDashboardRouteView() {
  const params = Route.useParams();
  const environmentId = params.environmentId as EnvironmentId;
  const projectId = params.projectId as ProjectId;
  const projectRef = useMemo(
    () => scopeProjectRef(environmentId, projectId),
    [environmentId, projectId],
  );

  const bootstrapComplete = useStore(
    (state) => selectEnvironmentState(state, environmentId).bootstrapComplete,
  );
  const project = useStore(useMemo(() => createProjectSelectorByRef(projectRef), [projectRef]));
  const projectGroupingSettings = useSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const allProjects = useStore(useShallow(selectProjectsAcrossEnvironments));

  const memberProjectRefs = useMemo(
    () =>
      project
        ? deriveSiblingProjectRefs({
            project,
            allProjects,
            settings: projectGroupingSettings,
          })
        : [],
    [project, allProjects, projectGroupingSettings],
  );

  useEffect(() => {
    if (!project) return;
    const logicalKey = deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings);
    useUiStateStore.getState().setProjectExpanded(logicalKey, true);
  }, [project, projectGroupingSettings]);

  if (!bootstrapComplete) {
    return <NoActiveThreadState />;
  }

  if (!project) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          That project is not available in this environment.
        </p>
        <Link
          to="/"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return <ProjectDashboard project={project} memberProjectRefs={memberProjectRefs} />;
}
