"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { anchoredToastManager } from "~/components/ui/toast";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { setAdoActionDialog, useAdoActionDialog } from "~/adoActionDialogState";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

export const AdoCommentDialog = memo(function AdoCommentDialog() {
  const dialog = useAdoActionDialog();
  const open = dialog?.kind === "comment";
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

  const close = useCallback(() => setAdoActionDialog(null), []);

  const submit = useCallback(async () => {
    if (!dialog || dialog.kind !== "comment") return;
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError("Comment cannot be empty.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await getPrimaryEnvironmentConnection().client.ado.addPullRequestComment({
        projectId: dialog.projectId,
        repositoryId: dialog.repositoryId,
        pullRequestId: dialog.pullRequestId,
        body: trimmed,
      });
      anchoredToastManager.add({ title: `Commented on !${dialog.pullRequestId}` });
      close();
    } catch (cause) {
      setError(errorDetail(cause));
    } finally {
      setSubmitting(false);
    }
  }, [body, close, dialog]);

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

  if (!open || !dialog || dialog.kind !== "comment") return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPopup className="max-w-lg">
        <form className="flex flex-col gap-3 p-6" onSubmit={handleSubmit}>
          <DialogTitle>
            Comment on <span className="font-mono">!{dialog.pullRequestId}</span>
            <span className="ml-2 text-muted-foreground text-sm font-normal">{dialog.title}</span>
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
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner /> : "Post comment"}
              </Button>
            </div>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
});
