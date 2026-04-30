"use client";

import {
  type JiraCredentials,
  type JiraCredentialsSnapshot,
  type JiraIssue,
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

import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogViewport,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { setJiraPickerOpen, useJiraPickerMode, useJiraPickerOpen } from "~/jiraPickerOpenState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { readLocalApi } from "~/localApi";
import { anchoredToastManager } from "~/components/ui/toast";

const notify = (title: string, description?: string) => {
  anchoredToastManager.add({ title, ...(description !== undefined ? { description } : {}) });
};

const SEARCH_DEBOUNCE_MS = 200;

type CredentialsFormState =
  | {
      readonly kind: "basic";
      readonly baseUrl: string;
      readonly email: string;
      readonly apiToken: string;
    }
  | {
      readonly kind: "bearer";
      readonly baseUrl: string;
      readonly apiKey: string;
    };

type PickerStage =
  | { readonly kind: "loading" }
  | { readonly kind: "credentials"; readonly snapshot: JiraCredentialsSnapshot }
  | { readonly kind: "search"; readonly snapshot: JiraCredentialsSnapshot };

const initialCredsFromSnapshot = (snapshot: JiraCredentialsSnapshot): CredentialsFormState => {
  if (snapshot.kind === "bearer") {
    return { kind: "bearer", baseUrl: snapshot.baseUrl ?? "", apiKey: "" };
  }
  return {
    kind: "basic",
    baseUrl: snapshot.baseUrl ?? "",
    email: snapshot.email ?? "",
    apiToken: "",
  };
};

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Jira request failed";

export const JiraPicker = memo(function JiraPicker() {
  const open = useJiraPickerOpen();
  const mode = useJiraPickerMode();
  const [stage, setStage] = useState<PickerStage>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly JiraIssue[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredentialsFormState>({
    kind: "basic",
    baseUrl: "",
    email: "",
    apiToken: "",
  });
  const [credsSubmitting, setCredsSubmitting] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleClose = useCallback(() => {
    setJiraPickerOpen(false);
  }, []);

  // Load credential snapshot whenever the picker opens.
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
        const snapshot = await getPrimaryEnvironmentConnection().client.jira.getCredentials();
        if (cancelled) return;
        if (!snapshot.configured) {
          setCreds(initialCredsFromSnapshot(snapshot));
          setStage({ kind: "credentials", snapshot });
        } else {
          setStage({ kind: "search", snapshot });
        }
      } catch (cause) {
        if (cancelled) return;
        setStage({ kind: "credentials", snapshot: { configured: false } });
        setCreds({ kind: "basic", baseUrl: "", email: "", apiToken: "" });
        setCredsError(errorDetail(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (stage.kind !== "search") return;
    let cancelled = false;
    setActiveIndex(0);
    const handle = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const trimmed = query.trim();
        const jql =
          trimmed.length === 0
            ? "assignee = currentUser() ORDER BY updated DESC"
            : /^[A-Z][A-Z0-9_]+-\d+$/.test(trimmed)
              ? `key = ${trimmed}`
              : `text ~ "${trimmed.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
        const page = await getPrimaryEnvironmentConnection().client.jira.search({
          jql,
          maxResults: 20,
        });
        if (cancelled) return;
        setResults(page.issues);
      } catch (cause) {
        if (cancelled) return;
        const message = errorDetail(cause);
        setSearchError(message);
        const tag =
          typeof cause === "object" && cause !== null && "_tag" in cause
            ? String((cause as { _tag: unknown })._tag)
            : "";
        if (tag === "JiraAuthError" || tag === "JiraConfigError") {
          setStage({ kind: "credentials", snapshot: { configured: false } });
          setCreds({ kind: "basic", baseUrl: "", email: "", apiToken: "" });
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

  const openIssueExternal = useCallback(async (issue: JiraIssue) => {
    const api = readLocalApi();
    if (api) {
      try {
        await api.shell.openExternal(issue.url);
      } catch (cause) {
        notify("Failed to open Jira", errorDetail(cause));
      }
    } else {
      window.open(issue.url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const linkIssueToThread = useCallback(
    async (issue: JiraIssue) => {
      if (!linkActiveTarget) return;
      try {
        await getPrimaryEnvironmentConnection().client.jira.linkThread({
          threadId: linkActiveTarget,
          issueKey: issue.key,
        });
        notify("Linked to thread", `${issue.key}: ${issue.summary}`);
        setJiraPickerOpen(false);
      } catch (cause) {
        notify("Failed to link issue", errorDetail(cause));
      }
    },
    [linkActiveTarget],
  );

  const handleResultActivate = useCallback(
    (issue: JiraIssue, options?: { readonly link?: boolean }) => {
      if (options?.link && linkActiveTarget) {
        void linkIssueToThread(issue);
        return;
      }
      if (linkActiveTarget) {
        void linkIssueToThread(issue);
        return;
      }
      void openIssueExternal(issue);
      setJiraPickerOpen(false);
    },
    [linkActiveTarget, linkIssueToThread, openIssueExternal],
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
        const issue = results[activeIndex];
        if (issue) {
          handleResultActivate(issue, { link: event.shiftKey });
        }
      } else if (event.key.toLowerCase() === "l" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        const issue = results[activeIndex];
        if (issue && linkActiveTarget) {
          void linkIssueToThread(issue);
        }
      }
    },
    [activeIndex, handleResultActivate, linkActiveTarget, linkIssueToThread, results],
  );

  const handleCredentialsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCredsError(null);
      setCredsSubmitting(true);
      try {
        const payload: JiraCredentials =
          creds.kind === "basic"
            ? {
                kind: "basic",
                baseUrl: creds.baseUrl.trim(),
                email: creds.email.trim(),
                apiToken: creds.apiToken,
              }
            : {
                kind: "bearer",
                baseUrl: creds.baseUrl.trim(),
                apiKey: creds.apiKey,
              };
        const snapshot =
          await getPrimaryEnvironmentConnection().client.jira.setCredentials(payload);
        setStage({ kind: "search", snapshot });
        notify("Jira credentials saved", payload.baseUrl);
      } catch (cause) {
        setCredsError(errorDetail(cause));
      } finally {
        setCredsSubmitting(false);
      }
    },
    [creds],
  );

  const dialogTitle = useMemo(() => {
    if (linkActiveTarget) return "Link Jira issue to thread";
    return "Jira";
  }, [linkActiveTarget]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      {open ? (
        <>
          <DialogBackdrop />
          <DialogViewport>
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
                      Configure access to your Atlassian Cloud instance.
                    </p>
                    <div className="flex gap-2 text-sm">
                      <button
                        type="button"
                        className={`rounded-md border px-3 py-1 ${
                          creds.kind === "basic"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        }`}
                        onClick={() =>
                          setCreds(
                            creds.kind === "basic"
                              ? creds
                              : { kind: "basic", baseUrl: creds.baseUrl, email: "", apiToken: "" },
                          )
                        }
                      >
                        API token
                      </button>
                      <button
                        type="button"
                        className={`rounded-md border px-3 py-1 ${
                          creds.kind === "bearer"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        }`}
                        onClick={() =>
                          setCreds(
                            creds.kind === "bearer"
                              ? creds
                              : { kind: "bearer", baseUrl: creds.baseUrl, apiKey: "" },
                          )
                        }
                      >
                        API key (Bearer)
                      </button>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span>Site URL</span>
                      <Input
                        autoFocus={true}
                        value={creds.baseUrl}
                        placeholder="https://your-org.atlassian.net"
                        onChange={(event) =>
                          setCreds({ ...creds, baseUrl: event.target.value })
                        }
                        required={true}
                      />
                    </label>
                    {creds.kind === "basic" ? (
                      <>
                        <label className="flex flex-col gap-1 text-sm">
                          <span>Email</span>
                          <Input
                            value={creds.email}
                            placeholder="you@example.com"
                            onChange={(event) =>
                              setCreds({ ...creds, email: event.target.value })
                            }
                            required={true}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          <span>API token</span>
                          <Input
                            type="password"
                            autoComplete="off"
                            value={creds.apiToken}
                            onChange={(event) =>
                              setCreds({ ...creds, apiToken: event.target.value })
                            }
                            required={true}
                          />
                        </label>
                      </>
                    ) : (
                      <label className="flex flex-col gap-1 text-sm">
                        <span>API key (Bearer token)</span>
                        <Input
                          type="password"
                          autoComplete="off"
                          value={creds.apiKey}
                          onChange={(event) =>
                            setCreds({ ...creds, apiKey: event.target.value })
                          }
                          required={true}
                        />
                      </label>
                    )}
                    {credsError ? (
                      <p className="text-destructive text-sm">{credsError}</p>
                    ) : null}
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
                      issues={results}
                      activeIndex={activeIndex}
                      linkMode={Boolean(linkActiveTarget)}
                      onActivate={(issue) => handleResultActivate(issue)}
                    />
                    <FooterHint linkMode={Boolean(linkActiveTarget)} />
                  </>
                ) : null}
              </div>
            </DialogPopup>
          </DialogViewport>
        </>
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
        placeholder="Search issues by text or paste a key (PROJ-123)…"
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
  readonly issues: readonly JiraIssue[];
  readonly activeIndex: number;
  readonly linkMode: boolean;
  readonly onActivate: (issue: JiraIssue) => void;
}) {
  if (props.issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No issues. Try a different query.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {props.issues.map((issue, index) => {
        const active = index === props.activeIndex;
        return (
          <li key={issue.key}>
            <button
              type="button"
              onClick={() => props.onActivate(issue)}
              className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:border-border hover:bg-muted/60"
              }`}
            >
              <span className="font-mono text-muted-foreground text-xs">{issue.key}</span>
              <span className="flex-1 truncate">{issue.summary}</span>
              {issue.status?.name ? (
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                  {issue.status.name}
                </span>
              ) : null}
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
        ? "Enter / click links the selected issue to the active thread."
        : "Enter opens in browser · Shift+Enter (or ⌘L) links to active thread"}
    </p>
  );
});
