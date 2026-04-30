"use client";

import type { ThreadId } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { memo, useCallback } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { Badge } from "~/components/ui/badge";
import { useLinkedJiraIssue } from "~/jiraThreadLinksState";
import { readLocalApi } from "~/localApi";

export const JiraLinkedIssueBadge = memo(function JiraLinkedIssueBadge(props: {
  readonly threadId: ThreadId;
}) {
  const link = useLinkedJiraIssue(props.threadId);
  const handleClick = useCallback(() => {
    if (!link) return;
    const url = `${link.baseUrl.replace(/\/+$/, "")}/browse/${link.issueKey}`;
    const localApi = readLocalApi();
    if (localApi) {
      void localApi.shell.openExternal(url);
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [link]);

  if (!link) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className="shrink-0 cursor-pointer gap-1 font-mono text-[10px]"
            onClick={handleClick}
          >
            {link.issueKey}
            <ExternalLinkIcon className="size-3" />
          </Badge>
        }
      />
      <TooltipPopup side="bottom">Open {link.issueKey} in browser</TooltipPopup>
    </Tooltip>
  );
});
