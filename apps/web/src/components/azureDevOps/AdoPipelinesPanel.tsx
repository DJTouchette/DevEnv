"use client";

import { type AdoBuildLogStreamEvent } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

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

import { AdoBuildRow } from "./AdoBuildRow";
import { useAdoActiveBuilds } from "./useAdoActiveBuilds";

export const AdoPipelinesPanel = memo(function AdoPipelinesPanel() {
  const open = useAdoPipelinesPanelOpen();
  const expanded = useAdoPipelinesPanelExpanded();
  const tailing = useAdoPipelinesPanelTailing();
  const { builds, subscribed, error: subError } = useAdoActiveBuilds({ enabled: open });

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
              ? `${builds.length} active build${builds.length === 1 ? "" : "s"}`
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
        ) : builds.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">
            No active runs in your watched projects. (Configure watched projects via the Azure
            DevOps picker.)
          </div>
        ) : (
          <ul className="flex flex-col">
            {builds.map((build) => (
              <AdoBuildRow
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
