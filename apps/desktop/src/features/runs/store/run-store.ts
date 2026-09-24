import { create } from "zustand";
import type { RunMessage, RunState } from "../types";
import { applyRunMessages } from "./apply-run-message";

interface RunStore {
  readonly run: RunState | null;
  readonly applyMessages: (messages: readonly RunMessage[]) => void;
  readonly dismiss: () => void;
}

export const useRunStore = create<RunStore>((set) => ({
  run: null,
  applyMessages: (messages) => set((state) => ({ run: applyRunMessages(state.run, messages) })),
  dismiss: () => set({ run: null }),
}));
