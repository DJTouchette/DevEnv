import type { AdoProjectId, AdoRepositoryId } from "@t3tools/contracts";
import { create } from "zustand";

export interface AdoDetailsTarget {
  readonly projectId: AdoProjectId;
  readonly repositoryId: AdoRepositoryId;
  readonly pullRequestId: number;
}

interface AdoDetailsDialogStoreState {
  readonly target: AdoDetailsTarget | null;
}

const useAdoDetailsDialogStore = create<
  AdoDetailsDialogStoreState & {
    setTarget: (next: AdoDetailsTarget | null) => void;
  }
>((set) => ({
  target: null,
  setTarget: (next) => set({ target: next }),
}));

export function useAdoDetailsTarget(): AdoDetailsTarget | null {
  return useAdoDetailsDialogStore((store) => store.target);
}

export function openAdoDetails(target: AdoDetailsTarget): void {
  useAdoDetailsDialogStore.getState().setTarget(target);
}

export function closeAdoDetails(): void {
  useAdoDetailsDialogStore.getState().setTarget(null);
}
