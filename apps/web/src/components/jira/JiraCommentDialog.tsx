"use client";

import type { JiraIssueKey, ThreadId } from "@t3tools/contracts";
import {
  type FormEvent,
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogViewport,
} from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { anchoredToastManager } from "~/components/ui/toast";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { setJiraActionDialog, useJiraActionDialog } from "~/jiraActionDialogState";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Jira request failed";

export const JiraCommentDialog = memo(function JiraCommentDialog() {
  const dialog = useJiraActionDialog();
  const open = dialog?.kind === "comment";
  const issueKey = open ? (dialog.issueKey as JiraIssueKey) : null;
  const threadId = open ? (dialog.threadId as ThreadId) : null;
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBody("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const close = useCallback(() => setJiraActionDialog(null), []);

  const submit = useCallback(async () => {
    if (!issueKey) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError("Comment cannot be empty.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await getPrimaryEnvironmentConnection().client.jira.addComment({
        issueKey,
        body: trimmed,
      });
      anchoredToastManager.add({
        title: `Commented on ${issueKey}`,
      });
      close();
    } catch (cause) {
      setError(errorDetail(cause));
    } finally {
      setSubmitting(false);
    }
  }, [body, close, issueKey]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  if (!open || !issueKey || !threadId) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogBackdrop />
      <DialogViewport>
        <DialogPopup className="max-w-lg">
          <form className="flex flex-col gap-3 p-6" onSubmit={handleSubmit}>
            <DialogTitle>
              Comment on <span className="font-mono">{issueKey}</span>
            </DialogTitle>
            <Textarea
              autoFocus={true}
              placeholder="Write a comment…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={5}
              disabled={submitting}
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-between gap-2">
              <p className="text-muted-foreground text-xs">⌘/Ctrl+Enter to post</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Spinner /> : "Post comment"}
                </Button>
              </div>
            </div>
          </form>
        </DialogPopup>
      </DialogViewport>
    </Dialog>
  );
});
