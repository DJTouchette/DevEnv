import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type JiraPickerMode = { kind: "open" } | { kind: "link"; threadId: ThreadId };

interface JiraPickerStoreState {
  readonly open: boolean;
  readonly mode: JiraPickerMode;
}

const useJiraPickerOpenStore = create<
  JiraPickerStoreState & {
    setState: (next: JiraPickerStoreState) => void;
  }
>((set) => ({
  open: false,
  mode: { kind: "open" } as JiraPickerMode,
  setState: (next) =>
    set((current) =>
      current.open === next.open && current.mode.kind === next.mode.kind ? current : next,
    ),
}));

export function useJiraPickerOpen(): boolean {
  return useJiraPickerOpenStore((store) => store.open);
}

export function useJiraPickerMode(): JiraPickerMode {
  return useJiraPickerOpenStore((store) => store.mode);
}

export function setJiraPickerOpen(open: boolean, mode?: JiraPickerMode): void {
  const next: JiraPickerStoreState = open
    ? { open: true, mode: mode ?? { kind: "open" } }
    : { open: false, mode: { kind: "open" } };
  useJiraPickerOpenStore.getState().setState(next);
}
