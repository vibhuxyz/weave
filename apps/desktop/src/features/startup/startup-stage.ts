import type { ProjectState } from "@/features/projects/hooks";
import type { ConnectionState } from "@/features/chat/hooks";

export interface StartupSignals {
  readonly project: ProjectState;
  readonly connection: ConnectionState;
  readonly hasAuthPrompt: boolean;
  readonly hasError: boolean;
}

export interface StartupStage {
  readonly isSettled: boolean;
  readonly message: string;
  readonly progress: number;
}

const SETTLED_CONNECTIONS: ReadonlySet<ConnectionState> = new Set(["ready", "closed", "error"]);

function runningProjectStage(signals: StartupSignals): StartupStage {
  if (signals.hasAuthPrompt || signals.hasError || SETTLED_CONNECTIONS.has(signals.connection)) {
    return { isSettled: true, message: "Ready", progress: 1 };
  }
  return { isSettled: false, message: "Opening your agent session…", progress: 0.75 };
}

export function resolveStartupStage(signals: StartupSignals): StartupStage {
  switch (signals.project.status) {
    case "loading":
      return { isSettled: false, message: "Loading your workspace…", progress: 0.2 };
    case "starting":
      return { isSettled: false, message: "Starting the agent server…", progress: 0.45 };
    case "running":
      return runningProjectStage(signals);
    case "none":
    case "error":
      return { isSettled: true, message: "Ready", progress: 1 };
    default: {
      const unreachable: never = signals.project;
      return unreachable;
    }
  }
}
