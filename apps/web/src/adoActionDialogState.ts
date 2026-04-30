import type { AdoProjectId, AdoRepositoryId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type AdoActionDialog =
  | {
      readonly kind: "comment";
      readonly threadId: ThreadId;
      readonly projectId: AdoProjectId;
      readonly repositoryId: AdoRepositoryId;
      readonly pullRequestId: number;
      readonly title: string;
    }
  | null;

const useAdoActionDialogStore = create<{
  active: AdoActionDialog;
  setActive: (next: AdoActionDialog) => void;
}>((set) => ({
  active: null,
  setActive: (next) => set({ active: next }),
}));

export function useAdoActionDialog(): AdoActionDialog {
  return useAdoActionDialogStore((store) => store.active);
}

export function setAdoActionDialog(next: AdoActionDialog): void {
  useAdoActionDialogStore.getState().setActive(next);
}
