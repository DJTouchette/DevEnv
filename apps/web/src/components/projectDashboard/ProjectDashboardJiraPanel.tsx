import type { JiraIssue, ThreadId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { memo, useCallback, useState, type FormEvent } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { getPrimaryEnvironmentConnection } from "../../environments/runtime";
import { openJiraDetails } from "../../jiraDetailsDialogState";
import { useLinkedJiraIssuesForThreads } from "../../jiraThreadLinksState";
import { setProjectExternalLinks, useProjectExternalLinks } from "../../projectExternalLinksStore";
import { formatRelativeTimeLabel } from "../../timestampFormat";

const RECENT_ISSUES_LIMIT = 20;

export const ProjectDashboardJiraPanel = memo(function ProjectDashboardJiraPanel(props: {
  readonly projectKey: string;
  readonly threadIds: ReadonlySet<ThreadId>;
}) {
  const { projectKey, threadIds } = props;
  const links = useProjectExternalLinks(projectKey);
  const jiraProjectKey = links.jiraProjectKey;
  const linkedIssues = useLinkedJiraIssuesForThreads(threadIds);
  const [showConfig, setShowConfig] = useState(false);

  const recentQuery = useQuery({
    queryKey: ["jira-project-recent", jiraProjectKey],
    enabled: typeof jiraProjectKey === "string" && jiraProjectKey.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<readonly JiraIssue[]> => {
      const page = await getPrimaryEnvironmentConnection().client.jira.search({
        jql: `project = "${jiraProjectKey}" ORDER BY updated DESC`,
        maxResults: RECENT_ISSUES_LIMIT,
      });
      return page.issues;
    },
  });

  const handleSave = useCallback(
    (next: string) => {
      setProjectExternalLinks(projectKey, { jiraProjectKey: next.trim() || undefined });
      setShowConfig(false);
    },
    [projectKey],
  );

  if (!jiraProjectKey) {
    return (
      <PanelShell
        title="Jira"
        action={null}
        body={<JiraConfigForm initial="" onSave={handleSave} />}
      />
    );
  }

  return (
    <PanelShell
      title={`Jira · ${jiraProjectKey}`}
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            onClick={() => recentQuery.refetch()}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Configure Jira project"
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
              <JiraConfigForm initial={jiraProjectKey} onSave={handleSave} />
            </div>
          ) : null}

          {linkedIssues.length > 0 ? (
            <Section title={`Linked to threads (${linkedIssues.length})`}>
              <ul className="flex flex-col gap-1">
                {linkedIssues.map((link) => (
                  <li key={link.threadId}>
                    <button
                      type="button"
                      onClick={() => openJiraDetails(link.issueKey)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
                    >
                      <span className="font-mono text-[11px] text-foreground">{link.issueKey}</span>
                      <ExternalLinkIcon className="size-3 text-muted-foreground" />
                      <span className="ml-auto text-[10px] text-muted-foreground/70">
                        {formatRelativeTimeLabel(link.linkedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Recent issues">
            {recentQuery.isPending ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Spinner /> Loading…
              </div>
            ) : recentQuery.isError ? (
              <div className="px-2 py-3 text-xs text-destructive">
                {recentQuery.error instanceof Error
                  ? recentQuery.error.message
                  : "Failed to load Jira issues."}
              </div>
            ) : recentQuery.data && recentQuery.data.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {recentQuery.data.map((issue) => (
                  <li key={issue.key}>
                    <button
                      type="button"
                      onClick={() => openJiraDetails(issue.key)}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/40"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-foreground">
                        {issue.key}
                      </span>
                      <span className="line-clamp-2 flex-1 text-xs text-muted-foreground">
                        {issue.summary}
                      </span>
                      {issue.status?.name ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {issue.status.name}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground/70">
                No recent issues for this project.
              </div>
            )}
          </Section>
        </>
      }
    />
  );
});

function JiraConfigForm(props: { initial: string; onSave: (next: string) => void }) {
  const { initial, onSave } = props;
  const [value, setValue] = useState(initial);
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSave(value);
    },
    [onSave, value],
  );
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Jira project key</span>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. PRJ"
          className="text-xs"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm">
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
