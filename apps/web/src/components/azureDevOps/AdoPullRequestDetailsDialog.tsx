"use client";

import type { AdoPullRequest, AdoPullRequestComment } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { closeAdoDetails, useAdoDetailsTarget } from "~/adoDetailsDialogState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { readLocalApi } from "~/localApi";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

const formatDate = (value?: string): string => {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

const stripRef = (ref: string | undefined): string | undefined => {
  if (!ref) return undefined;
  return ref.replace(/^refs\/heads\//, "");
};

export const AdoPullRequestDetailsDialog = memo(function AdoPullRequestDetailsDialog() {
  const target = useAdoDetailsTarget();
  const open = target !== null;
  const [pr, setPr] = useState<AdoPullRequest | null>(null);
  const [comments, setComments] = useState<readonly AdoPullRequestComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setPr(null);
      setComments([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [fetchedPr, fetchedComments] = await Promise.all([
          getPrimaryEnvironmentConnection().client.ado.getPullRequest({
            projectId: target.projectId,
            repositoryId: target.repositoryId,
            pullRequestId: target.pullRequestId,
          }),
          getPrimaryEnvironmentConnection()
            .client.ado.listPullRequestComments({
              projectId: target.projectId,
              repositoryId: target.repositoryId,
              pullRequestId: target.pullRequestId,
            })
            .catch(() => [] as readonly AdoPullRequestComment[]),
        ]);
        if (cancelled) return;
        setPr(fetchedPr);
        setComments(fetchedComments.slice(0, 5));
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
  }, [target]);

  const close = useCallback(() => closeAdoDetails(), []);

  const openInBrowser = useCallback(() => {
    if (!pr) return;
    const localApi = readLocalApi();
    if (localApi) {
      void localApi.shell.openExternal(pr.url);
    } else if (typeof window !== "undefined") {
      window.open(pr.url, "_blank", "noopener,noreferrer");
    }
  }, [pr]);

  if (!open || !target) return null;

  const sourceBranch = stripRef(pr?.sourceRefName);
  const targetBranch = stripRef(pr?.targetRefName);

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
              <span className="font-mono text-muted-foreground text-sm">
                !{target.pullRequestId}
              </span>
              {pr ? (
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                  {pr.status}
                </span>
              ) : null}
              {pr?.isDraft ? (
                <span className="rounded-full border px-2 py-0.5 text-amber-500 text-xs">
                  draft
                </span>
              ) : null}
            </div>
            <DialogTitle>{pr?.title ?? `Pull request !${target.pullRequestId}`}</DialogTitle>
          </div>
          {loading && !pr ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Loading…
            </div>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {pr ? (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Repo</dt>
                <dd className="truncate">
                  {pr.projectName} · {pr.repositoryName}
                </dd>
                {sourceBranch && targetBranch ? (
                  <>
                    <dt className="text-muted-foreground">Branches</dt>
                    <dd className="truncate font-mono text-xs">
                      {sourceBranch} → {targetBranch}
                    </dd>
                  </>
                ) : null}
                {pr.createdBy ? (
                  <>
                    <dt className="text-muted-foreground">Author</dt>
                    <dd>{pr.createdBy.displayName}</dd>
                  </>
                ) : null}
                {pr.creationDate ? (
                  <>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(pr.creationDate)}</dd>
                  </>
                ) : null}
                {pr.mergeStatus ? (
                  <>
                    <dt className="text-muted-foreground">Merge</dt>
                    <dd>{pr.mergeStatus}</dd>
                  </>
                ) : null}
              </dl>
              {pr.description && pr.description.length > 0 ? (
                <section className="flex flex-col gap-1">
                  <h3 className="text-muted-foreground text-xs uppercase">Description</h3>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                    {pr.description}
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
                          <span>{formatDate(comment.publishedDate)}</span>
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
            <Button onClick={openInBrowser} disabled={!pr}>
              <ExternalLinkIcon className="mr-2 size-3.5" /> Open in browser
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
});
