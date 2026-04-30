"use client";

import type { ThreadId } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { memo, useCallback } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { Badge } from "~/components/ui/badge";
import { useLinkedAdoPullRequest } from "~/adoThreadLinksState";
import { openAdoDetails } from "~/adoDetailsDialogState";

export const AdoLinkedPrBadge = memo(function AdoLinkedPrBadge(props: {
  readonly threadId: ThreadId;
}) {
  const link = useLinkedAdoPullRequest(props.threadId);
  const handleClick = useCallback(() => {
    if (!link) return;
    openAdoDetails({
      projectId: link.projectId,
      repositoryId: link.repositoryId,
      pullRequestId: link.pullRequestId,
    });
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
            !{link.pullRequestId}
            <ExternalLinkIcon className="size-3" />
          </Badge>
        }
      />
      <TooltipPopup side="bottom">{link.title}</TooltipPopup>
    </Tooltip>
  );
});
