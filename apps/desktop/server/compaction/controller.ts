import type { SessionUpdate } from "@weave/protocol";
import { MAX_ENGINE_TEXT_CHARS, MAX_REMEMBERED_OPERATIONS, MAX_TRACKED_SESSIONS } from "./constants.ts";
import {
  INITIAL_SESSION_STATE,
  applySessionUpdate,
  clearContext,
  engineCompactionStatus,
  markCompacted,
  markTurnCompleted,
  shouldAutoCompact,
  toContextSnapshot,
} from "./rules/index.ts";
import type { ActiveCompaction, SessionCompactionState } from "./types.ts";

export type BeginResult = "started" | "duplicate" | "busy";

type CapabilityListener = (sessionId: string, supportsCompaction: boolean) => void;

function captureActivity(active: ActiveCompaction, update: SessionUpdate): ActiveCompaction {
  const engineStatus = engineCompactionStatus(update);
  if (engineStatus) return { ...active, engineStatus };
  if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
    return { ...active, engineText: (active.engineText + update.content.text).slice(-MAX_ENGINE_TEXT_CHARS) };
  }
  if (update.sessionUpdate === "usage_update") {
    return { ...active, contextAfter: toContextSnapshot(update.used, update.size) ?? active.contextAfter };
  }
  return active;
}

export class CompactionController {
  private readonly states = new Map<string, SessionCompactionState>();
  private readonly rememberedOperations: string[] = [];
  private active: ActiveCompaction | null = null;
  private readonly onCapabilities: CapabilityListener;

  constructor(onCapabilities: CapabilityListener) {
    this.onCapabilities = onCapabilities;
  }

  stateFor(sessionId: string): SessionCompactionState {
    return this.states.get(sessionId) ?? INITIAL_SESSION_STATE;
  }

  observe(update: SessionUpdate, source: { readonly sessionId: string | undefined; readonly isReplay: boolean }): void {
    const { sessionId, isReplay } = source;
    if (!sessionId) return;
    const isCompacting = this.active?.sessionId === sessionId;
    if (this.active && isCompacting && !isReplay) this.active = captureActivity(this.active, update);
    const previous = this.stateFor(sessionId);
    const next = applySessionUpdate(previous, update, { isCompacting, isReplay });
    this.store(sessionId, next);
    if (next.supportsCompaction !== previous.supportsCompaction) {
      this.onCapabilities(sessionId, next.supportsCompaction);
    }
  }

  isCompacting(): boolean {
    return this.active !== null;
  }

  shouldAutoCompact(sessionId: string, threshold: unknown): boolean {
    return this.active === null && shouldAutoCompact(this.stateFor(sessionId), threshold);
  }

  begin(operationId: string, sessionId: string): BeginResult {
    if (this.rememberedOperations.includes(operationId)) return "duplicate";
    if (this.active) return "busy";
    this.rememberedOperations.push(operationId);
    if (this.rememberedOperations.length > MAX_REMEMBERED_OPERATIONS) this.rememberedOperations.shift();
    this.active = { operationId, sessionId, engineText: "", engineStatus: null, contextAfter: null };
    return "started";
  }

  end(operationId: string): ActiveCompaction | null {
    if (this.active?.operationId !== operationId) return null;
    const finished = this.active;
    this.active = null;
    return finished;
  }

  recordCompacted(sessionId: string): void {
    this.store(sessionId, markCompacted(this.stateFor(sessionId)));
  }

  recordTurnCompleted(sessionId: string): void {
    this.store(sessionId, markTurnCompleted(this.stateFor(sessionId)));
  }

  invalidateContext(sessionId: string): void {
    this.store(sessionId, clearContext(this.stateFor(sessionId)));
  }

  private store(sessionId: string, state: SessionCompactionState): void {
    this.states.delete(sessionId);
    this.states.set(sessionId, state);
    const oldest = this.states.keys().next();
    if (this.states.size > MAX_TRACKED_SESSIONS && !oldest.done) this.states.delete(oldest.value);
  }
}
