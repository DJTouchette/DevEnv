import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type AdoPickerMode = { kind: "open" } | { kind: "link"; threadId: ThreadId };

interface AdoPickerStoreState {
  readonly open: boolean;
  readonly mode: AdoPickerMode;
}

const useAdoPickerOpenStore = create<
  AdoPickerStoreState & {
    setState: (next: AdoPickerStoreState) => void;
  }
>((set) => ({
  open: false,
  mode: { kind: "open" } as AdoPickerMode,
  setState: (next) =>
    set((current) =>
      current.open === next.open && current.mode.kind === next.mode.kind ? current : next,
    ),
}));

export function useAdoPickerOpen(): boolean {
  return useAdoPickerOpenStore((store) => store.open);
}

export function useAdoPickerMode(): AdoPickerMode {
  return useAdoPickerOpenStore((store) => store.mode);
}

export function setAdoPickerOpen(open: boolean, mode?: AdoPickerMode): void {
  const next: AdoPickerStoreState = open
    ? { open: true, mode: mode ?? { kind: "open" } }
    : { open: false, mode: { kind: "open" } };
  useAdoPickerOpenStore.getState().setState(next);
}
