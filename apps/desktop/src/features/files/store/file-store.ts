import { create } from "zustand";
import type { FileMessage, FileViewState } from "../types";

interface FileStore {
  readonly openPath: string | null;
  readonly view: FileViewState | null;
  readonly isExpanded: boolean;
  readonly open: (path: string) => void;
  readonly close: () => void;
  readonly toggleExpanded: () => void;
  readonly receive: (message: FileMessage) => void;
}

function viewOf(message: FileMessage): FileViewState {
  return message.type === "file-content"
    ? { status: "loaded", content: message.content, truncated: message.truncated }
    : { status: "error", message: message.message };
}

export const useFileStore = create<FileStore>((set) => ({
  openPath: null,
  view: null,
  isExpanded: false,
  open: (path) => set({ openPath: path, view: { status: "loading" } }),
  close: () => set({ openPath: null, view: null }),
  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),
  receive: (message) => set((state) => (state.openPath === message.path ? { view: viewOf(message) } : state)),
}));
