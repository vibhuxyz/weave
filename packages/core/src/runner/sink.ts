import { describeCapabilityMismatch, type EngineDescriptor, type SessionSink } from "@weave/agent";
import type { SessionUpdate, TaskContract, WeaveEvent } from "@weave/protocol";
import type { Ledger } from "../shared/index.ts";

export interface RunTaskTracker {
  turns: number;
  stopped: "maxTurns" | "timeoutMs" | null;
  costUsd?: number;
  contextUsed?: number;
  contextSize?: number;
}

export interface CreateRunTaskSinkInput {
  task: TaskContract;
  ledger: Ledger;
  emit: (event: WeaveEvent) => void;
  engine: EngineDescriptor;
  maxTurns: number;
  tracker: RunTaskTracker;
  requestCancel: () => void;
}

function handleSessionUpdate(
  input: CreateRunTaskSinkInput,
  update: SessionUpdate,
): void {
  const { task, ledger, emit, maxTurns, tracker, requestCancel } = input;
  emit(ledger.append("agent.message", { taskId: task.id, update }));

  if (update.sessionUpdate === "tool_call") {
    tracker.turns += 1;
    if (tracker.turns > maxTurns && !tracker.stopped) {
      tracker.stopped = "maxTurns";
      requestCancel();
    }
  }

  if (update.sessionUpdate === "usage_update") {
    tracker.contextUsed = update.used;
    tracker.contextSize = update.size;
    if (update.cost) tracker.costUsd = update.cost.amount;
    emit(
      ledger.append("usage", {
        taskId: task.id,
        used: update.used,
        size: update.size,
        costUsd: update.cost?.amount,
      }),
    );
  }
}

function handlePermission(
  input: CreateRunTaskSinkInput,
  toolCall: string,
  options: Array<{ optionId: string; name: string; kind: string }>,
  decision: { decision: "allow" | "reject"; optionId?: string; reason: string },
): void {
  const { task, ledger, emit } = input;
  emit(ledger.append("permission.requested", { taskId: task.id, toolCall, options }));
  emit(
    ledger.append("permission.decided", {
      taskId: task.id,
      toolCall,
      decision: decision.decision,
      optionId: decision.optionId,
      reason: decision.reason,
    }),
  );
}

function handleCapabilities(input: CreateRunTaskSinkInput, capabilities: unknown): void {
  const { task, ledger, emit, engine } = input;
  emit(ledger.append("engine.capabilities", { taskId: task.id, engineId: engine.id, capabilities }));
  const mismatch = describeCapabilityMismatch(engine.capabilities, capabilities);
  if (mismatch) {
    emit(ledger.append("error", { taskId: task.id, where: "engine.capabilities", message: mismatch }));
  }
}

export function createRunTaskSink(input: CreateRunTaskSinkInput): SessionSink {
  const { task, ledger, emit } = input;
  return {
    onSpawned: (pid, entry) =>
      emit(ledger.append("agent.spawned", { taskId: task.id, pid, entry })),
    onSession: (sessionId, resumed, configOptions) =>
      emit(ledger.append("agent.session", { taskId: task.id, sessionId, resumed, configOptions })),
    onUpdate: (update: SessionUpdate) => handleSessionUpdate(input, update),
    onPermission: (toolCall, options, decision) => handlePermission(input, toolCall, options, decision),
    onFileRead: (path) => emit(ledger.append("file.read", { taskId: task.id, path })),
    onFileWritten: (path, bytes) => emit(ledger.append("file.written", { taskId: task.id, path, bytes })),
    onCapabilities: (capabilities) => handleCapabilities(input, capabilities),
  };
}
