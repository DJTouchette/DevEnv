"use client";

import {
  type AdoCredentialsSnapshot,
  type AdoProject,
  type AdoProjectId,
  type AdoPullRequest,
} from "@t3tools/contracts";
import { ExternalLinkIcon, Link2Icon } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { setAdoPickerOpen, useAdoPickerMode, useAdoPickerOpen } from "~/adoPickerOpenState";
import { openAdoDetails } from "~/adoDetailsDialogState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { readLocalApi } from "~/localApi";
import { anchoredToastManager } from "~/components/ui/toast";

const notify = (title: string, description?: string) => {
  anchoredToastManager.add({ title, ...(description !== undefined ? { description } : {}) });
};

const SEARCH_DEBOUNCE_MS = 200;

type CredentialsFormState = {
  readonly orgUrl: string;
  readonly pat: string;
};

type PickerStage =
  | { readonly kind: "loading" }
  | { readonly kind: "credentials"; readonly snapshot: AdoCredentialsSnapshot }
  | { readonly kind: "projects"; readonly snapshot: AdoCredentialsSnapshot }
  | { readonly kind: "search"; readonly snapshot: AdoCredentialsSnapshot };

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

export const AdoPicker = memo(function AdoPicker() {
  const open = useAdoPickerOpen();
  const mode = useAdoPickerMode();
  const [stage, setStage] = useState<PickerStage>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly AdoPullRequest[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredentialsFormState>({ orgUrl: "", pat: "" });
  const [credsSubmitting, setCredsSubmitting] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly AdoProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<ReadonlySet<AdoProjectId>>(new Set());
  const [savingProjects, setSavingProjects] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleClose = useCallback(() => {
    setAdoPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      setStage({ kind: "loading" });
      setQuery("");
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await getPrimaryEnvironmentConnection().client.ado.getCredentials();
        if (cancelled) return;
        if (!snapshot.configured) {
          setCreds({ orgUrl: snapshot.orgUrl ?? "", pat: "" });
          setStage({ kind: "credentials", snapshot });
        } else if (!snapshot.watchedProjectIds || snapshot.watchedProjectIds.length === 0) {
          setStage({ kind: "projects", snapshot });
        } else {
          setStage({ kind: "search", snapshot });
        }
      } catch (cause) {
        if (cancelled) return;
        setStage({ kind: "credentials", snapshot: { configured: false } });
        setCreds({ orgUrl: "", pat: "" });
        setCredsError(errorDetail(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (stage.kind !== "projects") return;
    let cancelled = false;
    setProjectsLoading(true);
    setSelectedProjects(new Set(stage.snapshot.watchedProjectIds ?? []));
    void (async () => {
      try {
        const list = await getPrimaryEnvironmentConnection().client.ado.listProjects();
        if (!cancelled) setProjects(list);
      } catch (cause) {
        if (!cancelled) {
          notify("Failed to list Azure DevOps projects", errorDetail(cause));
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // Debounced PR search.
  useEffect(() => {
    if (stage.kind !== "search") return;
    let cancelled = false;
    setActiveIndex(0);
    const handle = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const trimmed = query.trim();
        const page = await getPrimaryEnvironmentConnection().client.ado.searchPullRequests({
          ...(trimmed.length > 0 ? { query: trimmed } : {}),
          maxResults: 50,
        });
        if (cancelled) return;
        setResults(page.pullRequests);
      } catch (cause) {
        if (cancelled) return;
        const message = errorDetail(cause);
        setSearchError(message);
        const tag =
          typeof cause === "object" && cause !== null && "_tag" in cause
            ? String((cause as { _tag: unknown })._tag)
            : "";
        if (tag === "AdoAuthError" || tag === "AdoConfigError") {
          setStage({ kind: "credentials", snapshot: { configured: false } });
          setCreds({ orgUrl: "", pat: "" });
          setCredsError(message);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, stage.kind]);

  const linkActiveTarget = mode.kind === "link" ? mode.threadId : null;

  const openPrExternal = useCallback(async (pr: AdoPullRequest) => {
    const api = readLocalApi();
    if (api) {
      try {
        await api.shell.openExternal(pr.url);
      } catch (cause) {
        notify("Failed to open Azure DevOps", errorDetail(cause));
      }
    } else {
      window.open(pr.url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const linkPrToThread = useCallback(
    async (pr: AdoPullRequest) => {
      if (!linkActiveTarget) return;
      try {
        await getPrimaryEnvironmentConnection().client.ado.linkPrThread({
          threadId: linkActiveTarget,
          projectId: pr.projectId,
          repositoryId: pr.repositoryId,
          pullRequestId: pr.pullRequestId,
        });
        notify("Linked to thread", `${pr.projectName} · !${pr.pullRequestId} ${pr.title}`);
        setAdoPickerOpen(false);
      } catch (cause) {
        notify("Failed to link pull request", errorDetail(cause));
      }
    },
    [linkActiveTarget],
  );

  const handleResultActivate = useCallback(
    (pr: AdoPullRequest, options?: { readonly browser?: boolean }) => {
      if (options?.browser) {
        void openPrExternal(pr);
        setAdoPickerOpen(false);
        return;
      }
      if (linkActiveTarget) {
        void linkPrToThread(pr);
        return;
      }
      setAdoPickerOpen(false);
      openAdoDetails({
        projectId: pr.projectId,
        repositoryId: pr.repositoryId,
        pullRequestId: pr.pullRequestId,
      });
    },
    [linkActiveTarget, linkPrToThread, openPrExternal],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(results.length - 1, current + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const pr = results[activeIndex];
        if (pr) {
          handleResultActivate(pr, { browser: event.shiftKey });
        }
      } else if (event.key.toLowerCase() === "o" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        const pr = results[activeIndex];
        if (pr) handleResultActivate(pr, { browser: true });
      } else if (event.key.toLowerCase() === "l" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        const pr = results[activeIndex];
        if (pr && linkActiveTarget) {
          void linkPrToThread(pr);
        }
      }
    },
    [activeIndex, handleResultActivate, linkActiveTarget, linkPrToThread, results],
  );

  const handleCredentialsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCredsError(null);
      setCredsSubmitting(true);
      try {
        const snapshot = await getPrimaryEnvironmentConnection().client.ado.setCredentials({
          orgUrl: creds.orgUrl.trim(),
          pat: creds.pat,
        });
        setStage({ kind: "projects", snapshot });
        notify("Azure DevOps credentials saved", snapshot.orgUrl);
      } catch (cause) {
        setCredsError(errorDetail(cause));
      } finally {
        setCredsSubmitting(false);
      }
    },
    [creds],
  );

  const toggleProject = useCallback((id: AdoProjectId) => {
    setSelectedProjects((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const saveWatchedProjects = useCallback(async () => {
    setSavingProjects(true);
    try {
      const snapshot = await getPrimaryEnvironmentConnection().client.ado.setWatchedProjects({
        projectIds: Array.from(selectedProjects),
      });
      setStage({ kind: "search", snapshot });
      notify("Watched projects updated", `${selectedProjects.size} project(s)`);
    } catch (cause) {
      notify("Failed to save watched projects", errorDetail(cause));
    } finally {
      setSavingProjects(false);
    }
  }, [selectedProjects]);

  const dialogTitle = useMemo(() => {
    if (linkActiveTarget) return "Link Azure DevOps PR to thread";
    return "Azure DevOps";
  }, [linkActiveTarget]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      {open ? (
        <DialogPopup className="max-w-xl" showCloseButton={true}>
          <div className="flex flex-col gap-4 p-6">
            <DialogTitle>{dialogTitle}</DialogTitle>
            {stage.kind === "loading" ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Spinner /> Loading…
              </div>
            ) : null}
            {stage.kind === "credentials" ? (
              <form className="flex flex-col gap-3" onSubmit={handleCredentialsSubmit}>
                <p className="text-muted-foreground text-sm">
                  Configure access to your Azure DevOps organisation.
                </p>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Organisation URL</span>
                  <Input
                    autoFocus={true}
                    value={creds.orgUrl}
                    placeholder="https://dev.azure.com/your-org"
                    onChange={(event) => setCreds({ ...creds, orgUrl: event.target.value })}
                    required={true}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Personal Access Token</span>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={creds.pat}
                    onChange={(event) => setCreds({ ...creds, pat: event.target.value })}
                    required={true}
                  />
                </label>
                <p className="text-muted-foreground text-xs">
                  Generate one at User Settings → Personal access tokens. Needs Code (read), Build
                  (read), and Project &amp; Team (read) scopes.
                </p>
                {credsError ? <p className="text-destructive text-sm">{credsError}</p> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={credsSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={credsSubmitting}>
                    {credsSubmitting ? <Spinner /> : "Save credentials"}
                  </Button>
                </div>
              </form>
            ) : null}
            {stage.kind === "projects" ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Pick the projects to watch. The pipelines panel will only show active runs from
                  these projects.
                </p>
                {projectsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Spinner /> Loading projects…
                  </div>
                ) : (
                  <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
                    {projects.map((project) => {
                      const checked = selectedProjects.has(project.id);
                      return (
                        <li key={project.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm hover:border-border hover:bg-muted/60">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProject(project.id)}
                            />
                            <span className="flex-1 truncate">{project.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setSelectedProjects(new Set(projects.map((project) => project.id)))
                    }
                    disabled={projectsLoading || projects.length === 0}
                  >
                    Select all
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={savingProjects}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={saveWatchedProjects}
                      disabled={savingProjects || selectedProjects.size === 0}
                    >
                      {savingProjects ? <Spinner /> : "Save selection"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {stage.kind === "search" ? (
              <>
                <SearchBox
                  query={query}
                  onChange={setQuery}
                  onKeyDown={handleSearchKeyDown}
                  searching={searching}
                />
                {searchError ? (
                  <p className="text-destructive text-sm">{searchError}</p>
                ) : null}
                <ResultsList
                  pullRequests={results}
                  activeIndex={activeIndex}
                  linkMode={Boolean(linkActiveTarget)}
                  onActivate={(pr) => handleResultActivate(pr)}
                />
                <div className="flex items-center justify-between">
                  <FooterHint linkMode={Boolean(linkActiveTarget)} />
                  <button
                    type="button"
                    onClick={() => setStage({ kind: "projects", snapshot: stage.snapshot })}
                    className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                  >
                    Configure watched projects
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </DialogPopup>
      ) : null}
    </Dialog>
  );
});

const SearchBox = memo(function SearchBox(props: {
  readonly query: string;
  readonly onChange: (next: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly searching: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={inputRef}
        value={props.query}
        placeholder="Search active pull requests by title, repo, or PR number…"
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {props.searching ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Spinner /> Searching…
        </div>
      ) : null}
    </div>
  );
});

const ResultsList = memo(function ResultsList(props: {
  readonly pullRequests: readonly AdoPullRequest[];
  readonly activeIndex: number;
  readonly linkMode: boolean;
  readonly onActivate: (pr: AdoPullRequest) => void;
}) {
  if (props.pullRequests.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No active pull requests. Try a different query.</p>
    );
  }
  return (
    <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
      {props.pullRequests.map((pr, index) => {
        const active = index === props.activeIndex;
        return (
          <li key={`${pr.repositoryId}:${pr.pullRequestId}`}>
            <button
              type="button"
              onClick={() => props.onActivate(pr)}
              className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:border-border hover:bg-muted/60"
              }`}
            >
              <span className="font-mono text-muted-foreground text-xs">!{pr.pullRequestId}</span>
              <span className="flex-1 truncate">{pr.title}</span>
              <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                {pr.projectName} · {pr.repositoryName}
              </span>
              {props.linkMode ? (
                <Link2Icon className="h-4 w-4" />
              ) : (
                <ExternalLinkIcon className="h-4 w-4" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

const FooterHint = memo(function FooterHint(props: { readonly linkMode: boolean }) {
  return (
    <p className="text-muted-foreground text-xs">
      {props.linkMode
        ? "Enter / click links the selected PR to the active thread."
        : "Enter opens details · Shift+Enter (or ⌘O) opens in browser"}
    </p>
  );
});
