"use client";

import { type FormEvent, memo, useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { anchoredToastManager } from "~/components/ui/toast";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { setJiraActionDialog, useJiraActionDialog } from "~/jiraActionDialogState";

const PROJECT_KEY_STORAGE = "t3.jira.lastProjectKey";
const ISSUE_TYPE_STORAGE = "t3.jira.lastIssueType";

const readLocal = (key: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota errors
  }
};

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Jira request failed";

export const JiraCreateDialog = memo(function JiraCreateDialog() {
  const dialog = useJiraActionDialog();
  const open = dialog?.kind === "create";
  const threadId = open ? dialog.threadId : null;
  const defaults = open ? dialog.defaults : undefined;

  const [projectKey, setProjectKey] = useState("");
  const [issueType, setIssueType] = useState("Task");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      return;
    }
    setProjectKey(readLocal(PROJECT_KEY_STORAGE, ""));
    setIssueType(readLocal(ISSUE_TYPE_STORAGE, "Task"));
    setSummary(defaults?.summary ?? "");
    setDescription(defaults?.description ?? "");
  }, [defaults?.description, defaults?.summary, open]);

  const close = useCallback(() => setJiraActionDialog(null), []);

  const submit = useCallback(async () => {
    const projectKeyTrimmed = projectKey.trim().toUpperCase();
    const issueTypeTrimmed = issueType.trim();
    const summaryTrimmed = summary.trim();
    if (projectKeyTrimmed.length === 0 || summaryTrimmed.length === 0) {
      setError("Project key and summary are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const issue = await getPrimaryEnvironmentConnection().client.jira.createIssue({
        projectKey: projectKeyTrimmed,
        issueType: issueTypeTrimmed.length > 0 ? issueTypeTrimmed : "Task",
        summary: summaryTrimmed,
        ...(description.trim().length > 0 ? { description } : {}),
      });
      writeLocal(PROJECT_KEY_STORAGE, projectKeyTrimmed);
      writeLocal(ISSUE_TYPE_STORAGE, issueTypeTrimmed);
      if (threadId) {
        try {
          await getPrimaryEnvironmentConnection().client.jira.linkThread({
            threadId,
            issueKey: issue.key,
          });
        } catch (linkCause) {
          anchoredToastManager.add({
            title: "Created but failed to link",
            description: errorDetail(linkCause),
          });
          close();
          return;
        }
      }
      anchoredToastManager.add({
        title: `Created ${issue.key}`,
        description: issue.summary,
      });
      close();
    } catch (cause) {
      setError(errorDetail(cause));
    } finally {
      setSubmitting(false);
    }
  }, [close, description, issueType, projectKey, summary, threadId]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPopup className="max-w-lg">
        <form className="flex flex-col gap-3 p-6" onSubmit={handleSubmit}>
          <DialogTitle>Create Jira issue</DialogTitle>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>Project key</span>
              <Input
                autoFocus={true}
                placeholder="PROJ"
                value={projectKey}
                onChange={(event) => setProjectKey(event.target.value)}
                required={true}
                disabled={submitting}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Issue type</span>
              <Input
                value={issueType}
                placeholder="Task"
                onChange={(event) => setIssueType(event.target.value)}
                disabled={submitting}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>Summary</span>
            <Input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              required={true}
              disabled={submitting}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Description</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              disabled={submitting}
            />
          </label>
          {threadId ? (
            <p className="text-muted-foreground text-xs">
              The new issue will be linked to the active thread.
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : "Create"}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
});
