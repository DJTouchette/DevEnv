"use client";

import { type AdoBuild, type AdoBuildTimeline, type AdoTimelineRecord } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { setAdoPipelinesPanelTailing } from "~/adoPipelinesPanelState";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { useNowTick } from "~/hooks/useNowTick";
import { readLocalApi } from "~/localApi";

const errorDetail = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause !== null && "detail" in cause
      ? String((cause as { detail: unknown }).detail)
      : "Azure DevOps request failed";

export function formatBuildDuration(ms: number): string {
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

export function adoBuildStatusColor(
  status: AdoBuild["status"],
  result?: AdoBuild["result"],
): string {
  if (result === "succeeded") return "text-emerald-500";
  if (result === "failed") return "text-destructive";
  if (result === "canceled") return "text-muted-foreground";
  if (result === "partiallySucceeded") return "text-amber-500";
  if (status === "inProgress" || status === "completing") return "text-sky-500";
  if (status === "notStarted" || status === "postponed") return "text-muted-foreground";
  return "text-foreground";
}

export function adoBuildStatusLabel(
  status: AdoBuild["status"],
  result?: AdoBuild["result"],
): string {
  if (status === "completed" && result) return result;
  return status;
}

export const AdoBuildRow = memo(function AdoBuildRow(props: {
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
    startMs !== null ? (finishMs !== null ? finishMs - startMs : now - startMs) : null;

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
              <span className="truncate">· {build.sourceBranch.replace(/^refs\/heads\//, "")}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`font-mono text-[11px] uppercase ${adoBuildStatusColor(build.status, build.result)}`}
          >
            {adoBuildStatusLabel(build.status, build.result)}
          </span>
          <span className="font-mono text-muted-foreground text-[11px]">
            {elapsed !== null ? formatBuildDuration(elapsed) : "—"}
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
    startMs !== null ? (finishMs !== null ? finishMs - startMs : now - startMs) : null;
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
    <li className="flex items-center gap-2 text-xs" style={{ paddingLeft: `${indent * 12}px` }}>
      <span
        className={`font-mono ${adoBuildStatusColor(active ? "inProgress" : "completed", record.result)}`}
      >
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
        {elapsed !== null ? formatBuildDuration(elapsed) : "—"}
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
