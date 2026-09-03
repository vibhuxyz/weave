import type {
  TaskState,
  HandoffContext,
  CommandResult,
  VerificationResult,
  Decision,
} from "../normalize/types";

// ---------------------------------------------------------------------------
// Build HandoffContext from TaskState (§4)
//
// The receiving engine MUST verify the actual workspace (git status + diff)
// before trusting this context. The filesystem is authoritative.
// ---------------------------------------------------------------------------

export function buildHandoffContext(options: {
  taskState: TaskState;
  checkpointId: string;
  originalRequest: string;
  previousEngine: { provider: string; engine: string; model?: string };
  interruptionReason: string;
  lastKnownState?: string;
  maxCommands?: number;
  maxDecisions?: number;
}): HandoffContext {
  const {
    taskState: ts,
    checkpointId,
    originalRequest,
    previousEngine,
    interruptionReason,
    lastKnownState,
    maxCommands = 10,
    maxDecisions = 5,
  } = options;

  // Only carry the most recent/relevant commands to keep the context concise.
  const relevantCommands: CommandResult[] = ts.commands
    .filter((cmd) => cmd.exitCode !== 0 || cmd.command.includes("test") || cmd.command.includes("check"))
    .slice(-maxCommands);

  // Only carry the most important decisions.
  const importantDecisions: Decision[] = ts.decisions.slice(-maxDecisions);

  const verification: VerificationResult[] = ts.verification;

  const lastKnown =
    lastKnownState ??
    buildDefaultLastKnownState(ts);

  return {
    schemaVersion: 1,
    taskId: ts.taskId,
    runId: ts.runId,
    originalRequest,
    objective: ts.objective,
    previousEngine,
    interruption: { reason: interruptionReason },
    completed: ts.completed,
    inProgress: ts.inProgress?.description,
    remaining: ts.remaining,
    modifiedFiles: [
      ...ts.files.modified,
      ...ts.files.created,
    ],
    relevantCommands,
    verification,
    importantDecisions,
    lastKnownState: lastKnown,
    checkpointId,
  };
}

function buildDefaultLastKnownState(ts: TaskState): string {
  const parts: string[] = [];

  if (ts.inProgress) {
    parts.push(`Currently working on: ${ts.inProgress.description}`);
    if (ts.inProgress.lastStep) {
      parts.push(`Last step: ${ts.inProgress.lastStep}`);
    }
  }

  if (ts.completed.length > 0) {
    parts.push(`Completed ${ts.completed.length} step(s): ${ts.completed.slice(-3).join(", ")}`);
  }

  if (ts.remaining.length > 0) {
    parts.push(`Remaining: ${ts.remaining.slice(0, 5).join(", ")}`);
  }

  const failedVerifications = ts.verification.filter((v) => v.status === "failed");
  if (failedVerifications.length > 0) {
    parts.push(`Failed verifications: ${failedVerifications.map((v) => v.summary).join("; ")}`);
  }

  const failedCommands = ts.commands.filter((c) => c.exitCode !== 0);
  if (failedCommands.length > 0) {
    parts.push(`Failed commands: ${failedCommands.map((c) => c.command).slice(-3).join(", ")}`);
  }

  return parts.join("\n") || "No state information available.";
}
