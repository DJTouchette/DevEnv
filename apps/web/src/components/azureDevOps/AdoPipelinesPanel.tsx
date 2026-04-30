"use client";

import {
  type AdoActiveBuildsStreamEvent,
  type AdoBuild,
  type AdoBuildId,
  type AdoBuildLogStreamEvent,
  type AdoBuildTimeline,
  type AdoTimelineRecord,
} from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import {
  setAdoPipelinesPanelExpanded,
  setAdoPipelinesPanelOpen,
  setAdoPipelinesPanelTailing,
  useAdoPipelinesPanelExpanded,
  useAdoPipelinesPanelOpen,
  useAdoPipelinesPanelTailing,
} from "~/adoPipelinesPanelState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { readLocalApi } from "~/localApi";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function statusColor(status: AdoBuild["status"], result?: AdoBuild["result"]): string {
  if (result === "succeeded") return "text-emerald-500";
  if (result === "failed") return "text-destructive";
  if (result === "canceled") return "text-muted-foreground";
  if (result === "partiallySucceeded") return "text-amber-500";
  if (status === "inProgress" || status === "completing") return "text-sky-500";
  if (status === "notStarted" || status === "postponed") return "text-muted-foreground";
  return "text-foreground";
}

function statusLabel(status: AdoBuild["status"], result?: AdoBuild["result"]): string {
  if (status === "completed" && result) return result;
  return status;
}

function useNowTick(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(handle);
  }, [active, intervalMs]);
  return now;
}

export const AdoPipelinesPanel = memo(function AdoPipelinesPanel() {
  const open = useAdoPipelinesPanelOpen();
  const expanded = useAdoPipelinesPanelExpanded();
  const tailing = useAdoPipelinesPanelTailing();
  const [builds, setBuilds] = useState<ReadonlyMap<AdoBuildId, AdoBuild>>(new Map());
  const [subscribed, setSubscribed] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBuilds(new Map());
      setSubscribed(false);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = getPrimaryEnvironmentConnection().client.ado.subscribeActiveBuilds(
        {},
        (event: AdoActiveBuildsStreamEvent) => {
          if (cancelled) return;
          setSubError(null);
          setSubscribed(true);
          setBuilds((current) => {
            const next = new Map(current);
            switch (event.type) {
              case "snapshot":
                next.clear();
                for (const build of event.builds) next.set(build.id, build);
                return next;
              case "upsert":
                next.set(event.build.id, event.build);
                return next;
              case "removed":
                next.delete(event.buildId);
                return next;
              case "error":
                setSubError(event.detail);
                return current;
              default:
                return current;
            }
          });
        },
        {
          onResubscribe: () => {
            if (!cancelled) setBuilds(new Map());
          },
        },
      );
    } catch (cause) {
      setSubError(errorDetail(cause));
    }
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [open]);

  const sortedBuilds = useMemo(() => {
    return Array.from(builds.values()).toSorted((a, b) => {
      const at = a.startTime ?? a.queueTime ?? "";
      const bt = b.startTime ?? b.queueTime ?? "";
      return bt.localeCompare(at);
    });
  }, [builds]);

  const handleClose = useCallback(() => {
    setAdoPipelinesPanelOpen(false);
    setAdoPipelinesPanelExpanded(null);
    setAdoPipelinesPanelTailing(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed top-16 right-4 bottom-4 z-50 flex w-[28rem] max-w-[90vw] flex-col rounded-2xl border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="font-heading font-semibold">Azure DevOps pipelines</span>
          <span className="text-muted-foreground text-xs">
            {subscribed
              ? `${sortedBuilds.length} active build${sortedBuilds.length === 1 ? "" : "s"}`
              : "Connecting…"}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close panel">
          <XIcon className="size-4" />
        </Button>
      </div>
      {subError ? (
        <div className="border-b bg-destructive/10 px-4 py-2 text-destructive text-xs">
          {subError}
        </div>
      ) : null}
      <div className="flex-1 overflow-auto">
        {!subscribed ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
            <Spinner /> Connecting to Azure DevOps…
          </div>
        ) : sortedBuilds.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">
            No active runs in your watched projects. (Configure watched projects via the Azure
            DevOps picker.)
          </div>
        ) : (
          <ul className="flex flex-col">
            {sortedBuilds.map((build) => (
              <BuildRow
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
      </div>
      {tailing ? <LogTail key={`${tailing.buildId}:${tailing.logId}`} /> : null}
    </div>
  );
});

const BuildRow = memo(function BuildRow(props: {
  readonly build: AdoBuild;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const { build, isExpanded, onToggle } = props;
  const active = build.status === "inProgress" || build.status === "completing";
  const now = useNowTick(1000, active);
  const startMs = build.startTime ? Date.parse(build.startTime) : null;
  const finishMs = build.finishTime ? Date.parse(build.finishTime) : null;
  const elapsed =
    startMs !== null
      ? finishMs !== null
        ? finishMs - startMs
        : now - startMs
      : null;

  const openInBrowser = useCallback(() => {
    const localApi = readLocalApi();
    if (localApi) {
      void localApi.shell.openExternal(build.url);
    } else if (typeof window !== "undefined") {
      window.open(build.url, "_blank", "noopener,noreferrer");
    }
  }, [build.url]);

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted/60"
      >
        {isExpanded ? (
          <ChevronDownIcon className="size-4 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0" />
        )}
        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-2 truncate">
            <span className="truncate font-medium">{build.definition.name}</span>
            <span className="text-muted-foreground text-xs">#{build.buildNumber}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="truncate">{build.projectName}</span>
            {build.sourceBranch ? (
              <span className="truncate">
                · {build.sourceBranch.replace(/^refs\/heads\//, "")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`font-mono text-[11px] uppercase ${statusColor(build.status, build.result)}`}
          >
            {statusLabel(build.status, build.result)}
          </span>
          <span className="font-mono text-muted-foreground text-[11px]">
            {elapsed !== null ? formatDuration(elapsed) : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openInBrowser();
          }}
          className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open in browser"
        >
          <ExternalLinkIcon className="size-3.5" />
        </button>
      </button>
      {isExpanded ? <BuildTimelineView build={build} /> : null}
    </li>
  );
});

const BuildTimelineView = memo(function BuildTimelineView(props: { readonly build: AdoBuild }) {
  const [timeline, setTimeline] = useState<AdoBuildTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshOnTick = props.build.status === "inProgress" || props.build.status === "completing";
  const tickHandle = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getPrimaryEnvironmentConnection().client.ado.getBuildTimeline({
        projectId: props.build.projectId,
        buildId: props.build.id,
      });
      setTimeline(fresh);
      setError(null);
    } catch (cause) {
      setError(errorDetail(cause));
    } finally {
      setLoading(false);
    }
  }, [props.build.projectId, props.build.id]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!refreshOnTick) return;
    tickHandle.current = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(tickHandle.current);
  }, [refresh, refreshOnTick]);

  if (loading && !timeline) {
    return (
      <div className="flex items-center gap-2 px-6 py-2 text-muted-foreground text-xs">
        <Spinner /> Loading timeline…
      </div>
    );
  }
  if (error && !timeline) {
    return <div className="px-6 py-2 text-destructive text-xs">{error}</div>;
  }
  if (!timeline) return null;
  const visibleRecords = timeline.records.filter(
    (record) => record.type === "Stage" || record.type === "Job" || record.type === "Task",
  );
  if (visibleRecords.length === 0) {
    return <div className="px-6 py-2 text-muted-foreground text-xs">No timeline records yet.</div>;
  }
  return (
    <ul className="flex flex-col gap-0.5 px-6 py-2">
      {visibleRecords.map((record) => (
        <TimelineRow key={record.id} record={record} build={props.build} />
      ))}
    </ul>
  );
});

const TimelineRow = memo(function TimelineRow(props: {
  readonly record: AdoTimelineRecord;
  readonly build: AdoBuild;
}) {
  const { record, build } = props;
  const active = record.state === "inProgress";
  const now = useNowTick(1000, active);
  const startMs = record.startTime ? Date.parse(record.startTime) : null;
  const finishMs = record.finishTime ? Date.parse(record.finishTime) : null;
  const elapsed =
    startMs !== null
      ? finishMs !== null
        ? finishMs - startMs
        : now - startMs
      : null;
  const indent = record.type === "Stage" ? 0 : record.type === "Job" ? 1 : 2;
  const canTail = typeof record.logId === "number";
  const onTail = useCallback(() => {
    if (!canTail || record.logId === undefined) return;
    setAdoPipelinesPanelTailing({
      projectId: build.projectId,
      buildId: build.id,
      logId: record.logId,
      stepName: record.name,
    });
  }, [build.projectId, build.id, canTail, record.logId, record.name]);
  return (
    <li
      className="flex items-center gap-2 text-xs"
      style={{ paddingLeft: `${indent * 12}px` }}
    >
      <span className={`font-mono ${statusColor(active ? "inProgress" : "completed", record.result)}`}>
        {record.state === "inProgress"
          ? "•"
          : record.state === "pending"
            ? "·"
            : record.result === "failed"
              ? "✗"
              : record.result === "succeeded"
                ? "✓"
                : "○"}
      </span>
      <span className="flex-1 truncate">{record.name}</span>
      <span className="font-mono text-muted-foreground">
        {elapsed !== null ? formatDuration(elapsed) : "—"}
      </span>
      {canTail ? (
        <button
          type="button"
          onClick={onTail}
          className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          log
        </button>
      ) : null}
    </li>
  );
});

const LogTail = memo(function LogTail() {
  const tailing = useAdoPipelinesPanelTailing();
  const [lines, setLines] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tailing) return;
    let cancelled = false;
    setLines([]);
    setError(null);
    setDone(false);
    const unsubscribe = getPrimaryEnvironmentConnection().client.ado.subscribeBuildLog(
      {
        projectId: tailing.projectId,
        buildId: tailing.buildId,
        logId: tailing.logId,
      },
      (event: AdoBuildLogStreamEvent) => {
        if (cancelled) return;
        if (event.type === "chunk") {
          setLines((current) => current.concat(event.chunk.lines));
        } else if (event.type === "error") {
          setError(event.detail);
        } else if (event.type === "done") {
          setDone(true);
        }
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tailing]);

  if (!tailing) return null;
  return (
    <div className="flex max-h-72 flex-col border-t">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs">
        <div className="flex flex-col">
          <span className="font-medium">Log: {tailing.stepName}</span>
          <span className="text-muted-foreground">
            {done ? "complete" : "tailing…"} · {lines.length} lines
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setAdoPipelinesPanelTailing(null)}
          aria-label="Close log"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      {error ? <div className="px-4 py-1 text-destructive text-xs">{error}</div> : null}
      <pre className="flex-1 overflow-auto bg-black/30 px-3 py-2 font-mono text-[11px] leading-tight">
        {lines.join("\n")}
      </pre>
    </div>
  );
});
