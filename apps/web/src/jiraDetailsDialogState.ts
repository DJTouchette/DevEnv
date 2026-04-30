import type { JiraIssueKey } from "@t3tools/contracts";
import { create } from "zustand";

interface JiraDetailsDialogStoreState {
  readonly issueKey: JiraIssueKey | null;
}

const useJiraDetailsDialogStore = create<
  JiraDetailsDialogStoreState & {
    setIssueKey: (next: JiraIssueKey | null) => void;
  }
>((set) => ({
  issueKey: null,
  setIssueKey: (next) => set({ issueKey: next }),
}));

export function useJiraDetailsIssueKey(): JiraIssueKey | null {
  return useJiraDetailsDialogStore((store) => store.issueKey);
}

export function openJiraDetails(issueKey: JiraIssueKey): void {
  useJiraDetailsDialogStore.getState().setIssueKey(issueKey);
}

export function closeJiraDetails(): void {
  useJiraDetailsDialogStore.getState().setIssueKey(null);
}
