import {
  type AdoProject,
  type AdoProjectId,
  type AdoPullRequest,
  type ThreadId,
} from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState, type FormEvent } from "react";

import { AdoBuildRow } from "../azureDevOps/AdoBuildRow";
import { useAdoActiveBuilds } from "../azureDevOps/useAdoActiveBuilds";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { openAdoDetails } from "../../adoDetailsDialogState";
import { useLinkedAdoPullRequestsForThreads } from "../../adoThreadLinksState";
import {
  setAdoPipelinesPanelExpanded,
  useAdoPipelinesPanelExpanded,
} from "../../adoPipelinesPanelState";
import { getPrimaryEnvironmentConnection } from "../../environments/runtime";
import { setProjectExternalLinks, useProjectExternalLinks } from "../../projectExternalLinksStore";
import { formatRelativeTimeLabel } from "../../timestampFormat";

const RECENT_PRS_LIMIT = 20;

export const ProjectDashboardAdoPanel = memo(function ProjectDashboardAdoPanel(props: {
  readonly projectKey: string;
  readonly threadIds: ReadonlySet<ThreadId>;
}) {
  const { projectKey, threadIds } = props;
  const links = useProjectExternalLinks(projectKey);
  const adoProjectId = links.adoProjectId as AdoProjectId | undefined;
  const linkedPrs = useLinkedAdoPullRequestsForThreads(threadIds);
  const [showConfig, setShowConfig] = useState(false);

  const recentPrsQuery = useQuery({
    queryKey: ["ado-project-prs", adoProjectId],
    enabled: typeof adoProjectId === "string" && adoProjectId.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<readonly AdoPullRequest[]> => {
      const page = await getPrimaryEnvironmentConnection().client.ado.searchPullRequests({
        projectId: adoProjectId,
        maxResults: RECENT_PRS_LIMIT,
      });
      return page.pullRequests;
    },
  });

  const {
    builds,
    subscribed: buildsSubscribed,
    error: buildsError,
  } = useAdoActiveBuilds({
    enabled: typeof adoProjectId === "string" && adoProjectId.length > 0,
    projectIds: adoProjectId ? [adoProjectId] : undefined,
  });
  const expanded = useAdoPipelinesPanelExpanded();

  const handleSave = useCallback(
    (next: AdoProjectId | null) => {
      setProjectExternalLinks(projectKey, { adoProjectId: next ?? undefined });
      setShowConfig(false);
    },
    [projectKey],
  );

  if (!adoProjectId) {
    return (
      <PanelShell
        title="Azure DevOps"
        action={null}
        body={<AdoConfigForm initial={null} onSave={handleSave} />}
      />
    );
  }

  return (
    <PanelShell
      title="Azure DevOps"
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            onClick={() => recentPrsQuery.refetch()}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Configure ADO project"
            onClick={() => setShowConfig((open) => !open)}
          >
            <SettingsIcon className="size-3.5" />
          </Button>
        </div>
      }
      body={
        <>
          {showConfig ? (
            <div className="border-b border-border/60 px-3 py-2">
              <AdoConfigForm initial={adoProjectId} onSave={handleSave} />
            </div>
          ) : null}

          {linkedPrs.length > 0 ? (
            <Section title={`Linked to threads (${linkedPrs.length})`}>
              <ul className="flex flex-col gap-1">
                {linkedPrs.map((link) => (
                  <li key={link.threadId}>
                    <button
                      type="button"
                      onClick={() =>
                        openAdoDetails({
                          projectId: link.projectId,
                          repositoryId: link.repositoryId,
                          pullRequestId: link.pullRequestId,
                        })
                      }
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
                    >
                      <span className="font-mono text-[11px] text-foreground">
                        !{link.pullRequestId}
                      </span>
                      <span className="line-clamp-1 flex-1 text-muted-foreground">
                        {link.title}
                      </span>
                      <ExternalLinkIcon className="size-3 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Recent pull requests">
            {recentPrsQuery.isPending ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Spinner /> Loading…
              </div>
            ) : recentPrsQuery.isError ? (
              <div className="px-2 py-3 text-xs text-destructive">
                {recentPrsQuery.error instanceof Error
                  ? recentPrsQuery.error.message
                  : "Failed to load pull requests."}
              </div>
            ) : recentPrsQuery.data && recentPrsQuery.data.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {recentPrsQuery.data.map((pr) => (
                  <li key={pr.pullRequestId}>
                    <button
                      type="button"
                      onClick={() =>
                        openAdoDetails({
                          projectId: pr.projectId,
                          repositoryId: pr.repositoryId,
                          pullRequestId: pr.pullRequestId,
                        })
                      }
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/40"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-foreground">
                        !{pr.pullRequestId}
                      </span>
                      <span className="line-clamp-2 flex-1 text-xs text-muted-foreground">
                        {pr.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                        {pr.creationDate ? formatRelativeTimeLabel(pr.creationDate) : pr.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground/70">
                No pull requests for this project.
              </div>
            )}
          </Section>

          <Section title="Active builds">
            {buildsError ? (
              <div className="px-2 py-3 text-xs text-destructive">{buildsError}</div>
            ) : !buildsSubscribed ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Spinner /> Connecting…
              </div>
            ) : builds.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground/70">
                No active runs for this project.
              </div>
            ) : (
              <ul className="-mx-3 flex flex-col border-y">
                {builds.map((build) => (
                  <AdoBuildRow
                    key={build.id}
                    build={build}
                    isExpanded={
                      expanded?.buildId === build.id && expanded?.projectId === build.projectId
                    }
                    onToggle={() =>
                      expanded?.buildId === build.id
                        ? setAdoPipelinesPanelExpanded(null)
                        : setAdoPipelinesPanelExpanded({
                            projectId: build.projectId,
                            buildId: build.id,
                          })
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      }
    />
  );
});

function AdoConfigForm(props: {
  initial: AdoProjectId | null;
  onSave: (next: AdoProjectId | null) => void;
}) {
  const { initial, onSave } = props;
  const [projects, setProjects] = useState<readonly AdoProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(initial ?? "");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const list = await getPrimaryEnvironmentConnection().client.ado.listProjects();
        if (!cancelled) setProjects(list);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Failed to load Azure DevOps projects.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSave(selected ? (selected as AdoProjectId) : null);
    },
    [onSave, selected],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Azure DevOps project</span>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> Loading projects…
          </div>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">Select a project…</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm" disabled={!selected}>
          Save
        </Button>
      </div>
    </form>
  );
}

function PanelShell(props: { title: string; action: React.ReactNode; body: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-border/60 bg-card/30">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="font-heading text-sm font-semibold">{props.title}</span>
        {props.action}
      </div>
      <div className="flex flex-col gap-3 p-3">{props.body}</div>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground/70">
        {props.title}
      </span>
      {props.children}
    </div>
  );
}
