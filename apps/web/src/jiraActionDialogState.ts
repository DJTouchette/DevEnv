import type { JiraIssueKey, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type JiraActionDialog =
  | { readonly kind: "transition"; readonly threadId: ThreadId; readonly issueKey: JiraIssueKey }
  | { readonly kind: "comment"; readonly threadId: ThreadId; readonly issueKey: JiraIssueKey }
  | {
      readonly kind: "create";
      readonly threadId: ThreadId | null;
      readonly defaults?: { readonly summary?: string; readonly description?: string };
    }
  | null;

const useJiraActionDialogStore = create<{
  active: JiraActionDialog;
  setActive: (next: JiraActionDialog) => void;
}>((set) => ({
  active: null,
  setActive: (next) => set({ active: next }),
}));

export function useJiraActionDialog(): JiraActionDialog {
  return useJiraActionDialogStore((store) => store.active);
}

export function setJiraActionDialog(next: JiraActionDialog): void {
  useJiraActionDialogStore.getState().setActive(next);
}
