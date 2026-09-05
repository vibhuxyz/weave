import { usePersistedState } from "@/shared/hooks/usePersistedState";

/**
 * Ported from upstream `starterTasks.ts` (4-item checklist: connect a
 * provider, start a chat, name your first project, add a widget). Upstream
 * hides this behind a dev-only experiment flag in production; per the call
 * made here, Weave ships it visible by default instead.
 *
 * Upstream derives 3 of the 4 from live app state (a ready provider, a real
 * chat session, a real project) and leaves "add-widget" manual-only.
 * Wiring "start-chat" and "connect-provider" to Weave's actual runtime state
 * would mean reaching deep into `App.tsx`'s session/engine plumbing — out of
 * scope for this port. Only "create-project" gets real auto-detection here
 * (`useProjects().projects.length > 0`, already a cheap, existing hook); the
 * other three are manual, same mechanism upstream already uses for
 * "add-widget".
 */
export interface StarterTask {
  id: "connect-engine" | "start-chat" | "create-project" | "add-widget";
  titleKey: string;
  detailKey: string;
}

export const STARTER_TASKS: StarterTask[] = [
  {
    id: "connect-engine",
    titleKey: "starterTasks.connectEngine",
    detailKey: "starterTasks.taskDetails.connectEngine",
  },
  {
    id: "start-chat",
    titleKey: "starterTasks.startChat",
    detailKey: "starterTasks.taskDetails.startChat",
  },
  {
    id: "create-project",
    titleKey: "starterTasks.createProject",
    detailKey: "starterTasks.taskDetails.createProject",
  },
  {
    id: "add-widget",
    titleKey: "starterTasks.addWidget",
    detailKey: "starterTasks.taskDetails.addWidget",
  },
];

export type StarterTaskProgress = Record<string, boolean>;

export function useStarterTaskProgress() {
  return usePersistedState<StarterTaskProgress>(
    "weave:starterTaskProgress",
    {},
    (value, defaults) =>
      value && typeof value === "object" ? (value as StarterTaskProgress) : defaults,
  );
}
