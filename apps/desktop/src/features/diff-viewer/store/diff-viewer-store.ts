import { create } from "zustand";
import type { FileDiff } from "@/agent/diff";
import type { Commit, DiffMessage, Expansion, RefsState, StatsState } from "../types";

interface DiffViewerState {
  readonly statsRequestId: string | null;
  readonly patchRequests: ReadonlyMap<string, readonly string[]>;
  readonly missingPaths: ReadonlySet<string>;
  readonly stats: StatsState;
  readonly patchByPath: ReadonlyMap<string, FileDiff>;
  readonly loadingPaths: ReadonlySet<string>;
  readonly refs: RefsState | null;
  readonly commits: readonly Commit[];
  readonly sidebarOpen: boolean;
  readonly selectedPath: string | null;
  readonly collapsedFiles: ReadonlySet<string>;
  readonly expansions: ReadonlyMap<string, Expansion>;
  readonly contextLines: ReadonlyMap<string, readonly string[]>;
  readonly fileQuery: string;
  readonly searchOpen: boolean;
  readonly startStats: (requestId: string) => void;
  readonly startPatch: (requestId: string, paths: readonly string[]) => void;
  readonly putPatch: (files: readonly FileDiff[]) => void;
  readonly receive: (message: DiffMessage) => boolean;
  readonly setCollapsed: (paths: ReadonlySet<string>) => void;
  readonly toggleFile: (path: string) => void;
  readonly toggleSidebar: () => void;
  readonly selectPath: (path: string | null) => void;
  readonly setFileQuery: (query: string) => void;
  readonly toggleSearch: () => void;
  readonly expand: (key: string, direction: "up" | "down", step: number) => void;
  readonly reset: () => void;
}

const EMPTY = {
  statsRequestId: null,
  patchRequests: new Map<string, readonly string[]>(),
  missingPaths: new Set<string>(),
  stats: { status: "idle" } as StatsState,
  patchByPath: new Map<string, FileDiff>(),
  loadingPaths: new Set<string>(),
  selectedPath: null,
  collapsedFiles: new Set<string>(),
  expansions: new Map<string, Expansion>(),
  contextLines: new Map<string, readonly string[]>(),
  fileQuery: "",
  searchOpen: false,
};

function without<T>(set: ReadonlySet<T>, values: readonly T[]): Set<T> {
  const next = new Set(set);
  for (const value of values) next.delete(value);
  return next;
}

export const useDiffViewerStore = create<DiffViewerState>((set, get) => ({
  ...EMPTY,
  refs: null,
  commits: [],
  sidebarOpen: true,

  startStats: (requestId) => set({ ...EMPTY, statsRequestId: requestId, stats: { status: "loading" } }),

  startPatch: (requestId, paths) =>
    set((state) => ({
      patchRequests: new Map(state.patchRequests).set(requestId, paths),
      loadingPaths: new Set([...state.loadingPaths, ...paths]),
    })),

  putPatch: (files) =>
    set((state) => {
      const next = new Map(state.patchByPath);
      for (const file of files) next.set(file.path, file);
      return { patchByPath: next, loadingPaths: without(state.loadingPaths, files.map((file) => file.path)) };
    }),

  receive: (message) => {
    const state = get();
    switch (message.type) {
      case "diff-refs-result":
        set({ refs: { branch: message.branch, defaultBranch: message.defaultBranch, branches: message.branches } });
        return true;
      case "diff-commits-result":
        set({ commits: message.commits });
        return true;
      case "diff-files-result":
        if (message.requestId !== state.statsRequestId) return true;
        set({ stats: { status: "ready", files: message.files, skipped: message.skipped } });
        return true;
      case "diff-patch-result": {
        const asked = state.patchRequests.get(message.requestId);
        if (!asked) return true;
        const patches = new Map(state.patchByPath);
        for (const file of message.files) patches.set(file.path, file);
        const requests = new Map(state.patchRequests);
        requests.delete(message.requestId);
        const absent = asked.filter((path) => !patches.has(path));
        set({
          patchByPath: patches,
          patchRequests: requests,
          missingPaths: new Set([...state.missingPaths, ...absent]),
          loadingPaths: without(state.loadingPaths, asked),
        });
        return true;
      }
      case "diff-context-result": {
        const next = new Map(state.contextLines);
        next.set(`${message.path}@${String(message.from)}`, message.lines);
        set({ contextLines: next });
        return true;
      }
      case "diff-failed":
        if (message.requestId === state.statsRequestId) set({ stats: { status: "error", message: message.message } });
        else {
          const asked = state.patchRequests.get(message.requestId) ?? [];
          const requests = new Map(state.patchRequests);
          requests.delete(message.requestId);
          set({
            patchRequests: requests,
            missingPaths: new Set([...state.missingPaths, ...asked]),
            loadingPaths: without(state.loadingPaths, asked),
          });
        }
        return true;
      default:
        return false;
    }
  },

  setCollapsed: (paths) => set({ collapsedFiles: paths }),
  toggleFile: (path) =>
    set((state) => {
      const next = new Set(state.collapsedFiles);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { collapsedFiles: next };
    }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  selectPath: (path) => set({ selectedPath: path }),
  setFileQuery: (query) => set({ fileQuery: query }),
  toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen, fileQuery: state.searchOpen ? "" : state.fileQuery })),

  expand: (key, direction, step) =>
    set((state) => {
      const next = new Map(state.expansions);
      const current = next.get(key) ?? { up: 0, down: 0 };
      next.set(key, direction === "up" ? { ...current, up: current.up + step } : { ...current, down: current.down + step });
      return { expansions: next };
    }),

  reset: () => set({ ...EMPTY }),
}));
