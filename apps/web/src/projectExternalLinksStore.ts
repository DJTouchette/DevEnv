import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

export const PROJECT_EXTERNAL_LINKS_STORAGE_KEY = "t3code:project-external-links:v1";

export interface ProjectExternalLinks {
  jiraProjectKey?: string;
  adoProjectId?: string;
  adoRepositoryId?: string;
}

interface PersistedShape {
  byProjectKey?: Record<string, ProjectExternalLinks>;
}

function sanitizeEntry(value: unknown): ProjectExternalLinks | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const next: ProjectExternalLinks = {};
  if (typeof record.jiraProjectKey === "string" && record.jiraProjectKey.length > 0) {
    next.jiraProjectKey = record.jiraProjectKey;
  }
  if (typeof record.adoProjectId === "string" && record.adoProjectId.length > 0) {
    next.adoProjectId = record.adoProjectId;
  }
  if (typeof record.adoRepositoryId === "string" && record.adoRepositoryId.length > 0) {
    next.adoRepositoryId = record.adoRepositoryId;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function readPersisted(): Record<string, ProjectExternalLinks> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROJECT_EXTERNAL_LINKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedShape;
    const map = parsed.byProjectKey;
    if (!map || typeof map !== "object") return {};
    const next: Record<string, ProjectExternalLinks> = {};
    for (const [projectKey, value] of Object.entries(map)) {
      if (!projectKey) continue;
      const sanitized = sanitizeEntry(value);
      if (sanitized) {
        next[projectKey] = sanitized;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function persist(state: { byProjectKey: Record<string, ProjectExternalLinks> }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROJECT_EXTERNAL_LINKS_STORAGE_KEY,
      JSON.stringify({ byProjectKey: state.byProjectKey } satisfies PersistedShape),
    );
  } catch {
    // Quota errors must not break the dashboard.
  }
}

// `exactOptionalPropertyTypes` keeps optional fields free of `undefined`, so
// callers passing `undefined` to clear a key need an explicit shape.
export type ProjectExternalLinksPatch = {
  jiraProjectKey?: string | undefined;
  adoProjectId?: string | undefined;
  adoRepositoryId?: string | undefined;
};

interface ProjectExternalLinksStore {
  byProjectKey: Record<string, ProjectExternalLinks>;
  setLinks: (projectKey: string, patch: ProjectExternalLinksPatch) => void;
  clearLinks: (projectKey: string) => void;
}

export const useProjectExternalLinksStore = create<ProjectExternalLinksStore>((set) => ({
  byProjectKey: readPersisted(),
  setLinks: (projectKey, patch) =>
    set((state) => {
      const previous = state.byProjectKey[projectKey] ?? {};
      const merged: ProjectExternalLinks = { ...previous };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "") {
          delete merged[key as keyof ProjectExternalLinks];
        } else {
          merged[key as keyof ProjectExternalLinks] = value;
        }
      }
      const next: Record<string, ProjectExternalLinks> = { ...state.byProjectKey };
      if (Object.keys(merged).length === 0) {
        delete next[projectKey];
      } else {
        next[projectKey] = merged;
      }
      return { byProjectKey: next };
    }),
  clearLinks: (projectKey) =>
    set((state) => {
      if (!(projectKey in state.byProjectKey)) return state;
      const next = { ...state.byProjectKey };
      delete next[projectKey];
      return { byProjectKey: next };
    }),
}));

const debouncedPersist = new Debouncer(persist, { wait: 200 });

useProjectExternalLinksStore.subscribe((state) => debouncedPersist.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    debouncedPersist.flush();
  });
}

export function useProjectExternalLinks(projectKey: string | null): ProjectExternalLinks {
  return useProjectExternalLinksStore((state) =>
    projectKey ? (state.byProjectKey[projectKey] ?? EMPTY) : EMPTY,
  );
}

const EMPTY: ProjectExternalLinks = Object.freeze({});

export function setProjectExternalLinks(
  projectKey: string,
  patch: ProjectExternalLinksPatch,
): void {
  useProjectExternalLinksStore.getState().setLinks(projectKey, patch);
}
