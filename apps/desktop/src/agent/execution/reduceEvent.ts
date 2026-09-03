import type {
  TaskState,
  TaskStatus,
  CommandResult,
  VerificationResult,
} from "../normalize/types";

// ---------------------------------------------------------------------------
// Normalized event shape (simplified — matches ACP SessionUpdate structure)
// ---------------------------------------------------------------------------

export interface NormalizedEvent {
  id?: string;
  seq?: number;
  type: string;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialTaskState(options: {
  taskId: string;
  runId: string;
  objective: string;
}): TaskState {
  return {
    schemaVersion: 1,
    taskId: options.taskId,
    runId: options.runId,
    objective: options.objective,
    status: "idle",
    completed: [],
    inProgress: undefined,
    remaining: [],
    files: { read: [], modified: [], created: [], deleted: [] },
    commands: [],
    verification: [],
    decisions: [],
    errors: [],
    lastCheckpointId: undefined,
  };
}

// ---------------------------------------------------------------------------
// Pure reducer — never mutates, always returns new state
// ---------------------------------------------------------------------------

export function reduceEvent(state: TaskState, event: NormalizedEvent): TaskState {
  switch (event.type) {
    case "agent_started":
      return { ...state, status: "running" };

    case "agent_completed":
      return {
        ...state,
        status: "completed",
        inProgress: undefined,
        completed: state.inProgress
          ? [...state.completed, state.inProgress.description]
          : state.completed,
      };

    case "agent_failed": {
      const msg = String(event.payload?.message ?? "Unknown error");
      return {
        ...state,
        status: "failed",
        errors: [
          ...state.errors,
          {
            message: msg,
            eventId: event.id,
            timestamp: new Date().toISOString(),
            fatal: true,
          },
        ],
      };
    }

    case "agent_interrupted":
      return { ...state, status: "interrupted" };

    case "agent_cancelled":
      return { ...state, status: "cancelled" };

    case "provider_limit":
      return { ...state, status: "provider_limit" };

    case "file_read": {
      const path = String(event.payload?.path ?? "");
      if (!path || state.files.read.includes(path)) return state;
      return { ...state, files: { ...state.files, read: [...state.files.read, path] } };
    }

    case "file_written": {
      const path = String(event.payload?.path ?? "");
      if (!path) return state;
      const modified = state.files.modified.includes(path)
        ? state.files.modified
        : [...state.files.modified, path];
      return { ...state, files: { ...state.files, modified } };
    }

    case "file_created": {
      const path = String(event.payload?.path ?? "");
      if (!path) return state;
      const created = state.files.created.includes(path)
        ? state.files.created
        : [...state.files.created, path];
      return { ...state, files: { ...state.files, created } };
    }

    case "file_deleted": {
      const path = String(event.payload?.path ?? "");
      if (!path) return state;
      const deleted = state.files.deleted.includes(path)
        ? state.files.deleted
        : [...state.files.deleted, path];
      return { ...state, files: { ...state.files, deleted } };
    }

    case "command_executed": {
      const cmd: CommandResult = {
        command: String(event.payload?.command ?? ""),
        exitCode: Number(event.payload?.exitCode ?? 0),
        stdout: event.payload?.stdout != null ? String(event.payload.stdout) : undefined,
        stderr: event.payload?.stderr != null ? String(event.payload.stderr) : undefined,
        durationMs: event.payload?.durationMs != null ? Number(event.payload.durationMs) : undefined,
      };
      return { ...state, commands: [...state.commands, cmd] };
    }

    case "verification_result": {
      const result: VerificationResult = {
        kind: (event.payload?.kind as VerificationResult["kind"]) ?? "custom",
        status: (event.payload?.status as VerificationResult["status"]) ?? "skipped",
        summary: String(event.payload?.summary ?? ""),
      };
      return { ...state, verification: [...state.verification, result] };
    }

    case "checkpoint_saved": {
      const checkpointId = String(event.payload?.checkpointId ?? "");
      if (!checkpointId) return state;
      return { ...state, lastCheckpointId: checkpointId };
    }

    case "step_started": {
      const description = String(event.payload?.description ?? "");
      return {
        ...state,
        inProgress: { description, lastStep: undefined },
      };
    }

    case "step_completed": {
      const description = state.inProgress?.description ?? String(event.payload?.description ?? "");
      return {
        ...state,
        completed: description ? [...state.completed, description] : state.completed,
        inProgress: undefined,
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Status mapping: TaskStatus → AgentStatus
// ---------------------------------------------------------------------------

export function taskStatusToAgentStatus(status: TaskStatus): import("../normalize/types").AgentStatus {
  const map: Record<TaskStatus, import("../normalize/types").AgentStatus> = {
    idle: "idle",
    running: "running",
    paused: "waiting_user",
    completed: "completed",
    failed: "failed",
    interrupted: "interrupted",
    cancelled: "cancelled",
    provider_limit: "provider_limit",
  };
  return map[status] ?? "idle";
}
