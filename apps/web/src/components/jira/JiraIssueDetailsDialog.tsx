"use client";

import type { JiraComment, JiraIssue } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { closeJiraDetails, useJiraDetailsIssueKey } from "~/jiraDetailsDialogState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { readLocalApi } from "~/localApi";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Jira request failed";

const formatDate = (value?: string): string => {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

export const JiraIssueDetailsDialog = memo(function JiraIssueDetailsDialog() {
  const issueKey = useJiraDetailsIssueKey();
  const open = issueKey !== null;
  const [issue, setIssue] = useState<JiraIssue | null>(null);
  const [comments, setComments] = useState<readonly JiraComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issueKey) {
      setIssue(null);
      setComments([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [fetchedIssue, fetchedComments] = await Promise.all([
          getPrimaryEnvironmentConnection().client.jira.getIssue({ issueKey }),
          getPrimaryEnvironmentConnection()
            .client.jira.listComments({ issueKey, maxResults: 5 })
            .catch(() => [] as readonly JiraComment[]),
        ]);
        if (cancelled) return;
        setIssue(fetchedIssue);
        setComments(fetchedComments);
      } catch (cause) {
        if (cancelled) return;
        setError(errorDetail(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueKey]);

  const close = useCallback(() => closeJiraDetails(), []);

  const openInBrowser = useCallback(() => {
    if (!issue) return;
    const localApi = readLocalApi();
    if (localApi) {
      void localApi.shell.openExternal(issue.url);
    } else if (typeof window !== "undefined") {
      window.open(issue.url, "_blank", "noopener,noreferrer");
    }
  }, [issue]);

  if (!open || !issueKey) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPopup className="max-w-2xl" showCloseButton={true}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground text-sm">{issueKey}</span>
              {issue?.status?.name ? (
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                  {issue.status.name}
                </span>
              ) : null}
            </div>
            <DialogTitle>{issue?.summary ?? issueKey}</DialogTitle>
          </div>
          {loading && !issue ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Loading…
            </div>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {issue ? (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                {issue.assignee ? (
                  <>
                    <dt className="text-muted-foreground">Assignee</dt>
                    <dd>{issue.assignee.displayName}</dd>
                  </>
                ) : null}
                {issue.reporter ? (
                  <>
                    <dt className="text-muted-foreground">Reporter</dt>
                    <dd>{issue.reporter.displayName}</dd>
                  </>
                ) : null}
                {issue.updated ? (
                  <>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{formatDate(issue.updated)}</dd>
                  </>
                ) : null}
              </dl>
              {issue.description ? (
                <section className="flex flex-col gap-1">
                  <h3 className="text-muted-foreground text-xs uppercase">Description</h3>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                    {issue.description}
                  </pre>
                </section>
              ) : null}
              <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs uppercase">
                  Comments ({comments.length})
                </h3>
                {comments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No comments yet.</p>
                ) : (
                  <ul className="flex max-h-72 flex-col gap-2 overflow-auto">
                    {comments.map((comment) => (
                      <li key={comment.id} className="rounded-md border bg-muted/40 p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between text-muted-foreground text-xs">
                          <span>{comment.author?.displayName ?? "Unknown"}</span>
                          <span>{formatDate(comment.created)}</span>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans">{comment.body}</pre>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            <Button onClick={openInBrowser} disabled={!issue}>
              <ExternalLinkIcon className="mr-2 size-3.5" /> Open in browser
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
});
