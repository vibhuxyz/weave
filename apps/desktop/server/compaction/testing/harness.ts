import type { ServerMessage } from "../../shared/index.ts";
import { compactBeforePrompt } from "../compact-before-prompt.ts";
import { CompactionController } from "../controller.ts";
import { FakeEngine, type WireEvent } from "./fake-engine.ts";
import { COMMANDS_WITH_COMPACT, usage } from "./fixtures.ts";

export type LogEntry = WireEvent | { readonly kind: "server"; readonly msg: ServerMessage };

export const DEFAULT_THRESHOLD = 0.8;

export function createHarness(sessionId = "session-1") {
  const log: LogEntry[] = [];
  const send = (msg: ServerMessage) => log.push({ kind: "server", msg });
  const controller = new CompactionController((id, supportsCompaction) =>
    send({ type: "session-capabilities", sessionId: id, supportsCompaction }),
  );
  const engine = new FakeEngine(sessionId, controller, (event) => log.push(event));
  return { log, send, controller, engine };
}

export type Harness = ReturnType<typeof createHarness>;

export function primeSession({ engine, controller }: Harness, contextTokens: number): void {
  engine.emit(COMMANDS_WITH_COMPACT);
  engine.emit(usage(contextTokens));
  controller.recordTurnCompleted(engine.sessionId);
}

export async function sendUserPrompt(
  harness: Harness,
  request: { readonly text: string; readonly promptId: string; readonly threshold?: number },
) {
  const { controller, engine, send } = harness;
  const preflight = await compactBeforePrompt({
    controller,
    session: engine,
    promptId: request.promptId,
    threshold: request.threshold ?? DEFAULT_THRESHOLD,
    send,
    newOperationId: () => `auto-${request.promptId}`,
  });
  if (preflight.kind === "withdrawn") return preflight;
  const { stopReason } = await engine.prompt([{ type: "text", text: request.text }]);
  send({ type: "turn-end", stopReason });
  controller.recordTurnCompleted(engine.sessionId);
  return preflight;
}

function describeServer(msg: ServerMessage): string | null {
  switch (msg.type) {
    case "compaction":
      return `compaction:${msg.status}`;
    case "prompt-withdrawn":
      return `withdrawn:${msg.promptId}`;
    case "session-capabilities":
      return `capabilities:${msg.supportsCompaction}`;
    case "turn-end":
      return "turn-end";
    default:
      return null;
  }
}

export function timeline(log: readonly LogEntry[]): string[] {
  return log.flatMap((entry) => {
    if (entry.kind === "engine-prompt") return [`engine-prompt:${entry.text}`];
    if (entry.kind === "engine-update") return [];
    const described = describeServer(entry.msg);
    return described ? [described] : [];
  });
}

export function compactionEvents(log: readonly LogEntry[]) {
  return log.flatMap((entry) =>
    entry.kind === "server" && entry.msg.type === "compaction" ? [entry.msg] : [],
  );
}
