import type { AdoBuildId, AdoProjectId } from "@t3tools/contracts";
import { create } from "zustand";

interface AdoPipelinesPanelStoreState {
  readonly open: boolean;
  readonly expanded: { readonly projectId: AdoProjectId; readonly buildId: AdoBuildId } | null;
  readonly tailing: {
    readonly projectId: AdoProjectId;
    readonly buildId: AdoBuildId;
    readonly logId: number;
    readonly stepName: string;
  } | null;
}

const useAdoPipelinesPanelStore = create<
  AdoPipelinesPanelStoreState & {
    setOpen: (open: boolean) => void;
    setExpanded: (next: AdoPipelinesPanelStoreState["expanded"]) => void;
    setTailing: (next: AdoPipelinesPanelStoreState["tailing"]) => void;
  }
>((set) => ({
  open: false,
  expanded: null,
  tailing: null,
  setOpen: (open) =>
    set((current) =>
      current.open === open ? current : { ...current, open, ...(open ? {} : { tailing: null }) },
    ),
  setExpanded: (next) => set((current) => ({ ...current, expanded: next })),
  setTailing: (next) => set((current) => ({ ...current, tailing: next })),
}));

export function useAdoPipelinesPanelOpen(): boolean {
  return useAdoPipelinesPanelStore((store) => store.open);
}

export function useAdoPipelinesPanelExpanded() {
  return useAdoPipelinesPanelStore((store) => store.expanded);
}

export function useAdoPipelinesPanelTailing() {
  return useAdoPipelinesPanelStore((store) => store.tailing);
}

export function setAdoPipelinesPanelOpen(open: boolean): void {
  useAdoPipelinesPanelStore.getState().setOpen(open);
}

export function toggleAdoPipelinesPanel(): void {
  const store = useAdoPipelinesPanelStore.getState();
  store.setOpen(!store.open);
}

export function setAdoPipelinesPanelExpanded(
  next: AdoPipelinesPanelStoreState["expanded"],
): void {
  useAdoPipelinesPanelStore.getState().setExpanded(next);
}

export function setAdoPipelinesPanelTailing(
  next: AdoPipelinesPanelStoreState["tailing"],
): void {
  useAdoPipelinesPanelStore.getState().setTailing(next);
}
