"use client";

import type { JiraIssueKey, JiraTransition, ThreadId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useState, type KeyboardEvent } from "react";

import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { anchoredToastManager } from "~/components/ui/toast";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { setJiraActionDialog, useJiraActionDialog } from "~/jiraActionDialogState";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Jira request failed";

export const JiraTransitionPicker = memo(function JiraTransitionPicker() {
  const dialog = useJiraActionDialog();
  const open = dialog?.kind === "transition";
  const issueKey = open ? (dialog.issueKey as JiraIssueKey) : null;
  const threadId = open ? (dialog.threadId as ThreadId) : null;
  const [transitions, setTransitions] = useState<readonly JiraTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !issueKey) {
      setTransitions([]);
      setError(null);
      setActiveIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await getPrimaryEnvironmentConnection().client.jira.listTransitions({
          issueKey,
        });
        if (!cancelled) setTransitions(list);
      } catch (cause) {
        if (!cancelled) setError(errorDetail(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueKey, open]);

  const close = useCallback(() => setJiraActionDialog(null), []);

  const apply = useCallback(
    async (transition: JiraTransition) => {
      if (!issueKey) return;
      setSubmittingId(transition.id);
      try {
        await getPrimaryEnvironmentConnection().client.jira.transitionIssue({
          issueKey,
          transitionId: transition.id,
        });
        anchoredToastManager.add({
          title: `${issueKey} → ${transition.toStatus?.name ?? transition.name}`,
        });
        close();
      } catch (cause) {
        anchoredToastManager.add({
          title: "Transition failed",
          description: errorDetail(cause),
        });
      } finally {
        setSubmittingId(null);
      }
    },
    [close, issueKey],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (transitions.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(transitions.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const transition = transitions[activeIndex];
        if (transition) void apply(transition);
      }
    },
    [activeIndex, apply, transitions],
  );

  if (!open || !issueKey || !threadId) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPopup className="max-w-md">
        <div className="flex flex-col gap-3 p-6" onKeyDown={handleKeyDown} tabIndex={-1}>
          <DialogTitle>
            Transition <span className="font-mono">{issueKey}</span>
          </DialogTitle>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Loading transitions…
            </div>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {!loading && !error && transitions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transitions available.</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {transitions.map((transition, index) => {
              const active = index === activeIndex;
              const submitting = submittingId === transition.id;
              return (
                <li key={transition.id}>
                  <button
                    type="button"
                    onClick={() => apply(transition)}
                    disabled={submittingId !== null}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "border-foreground bg-muted"
                        : "border-transparent hover:border-border hover:bg-muted/60"
                    }`}
                  >
                    <span>{transition.name}</span>
                    <div className="flex items-center gap-2">
                      {transition.toStatus?.name ? (
                        <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                          {transition.toStatus.name}
                        </span>
                      ) : null}
                      {submitting ? <Spinner /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-xs">↑/↓ to navigate · Enter to apply</p>
        </div>
      </DialogPopup>
    </Dialog>
  );
});
