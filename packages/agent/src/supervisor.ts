import type { TaskContract } from "@weave/protocol";
import { openSession, type AgentSession, type SessionSink } from "./session.ts";
import type { PermissionPolicy } from "./permissions.ts";
import { DEFAULT_ENGINE_ID } from "./engines.ts";

/**
 * One conversation, many engines.
 *
 * ACP binds the agent at `session/new`, so "switch engine" is never an
 * in-place swap — it is a fresh engine session that the caller carries prior
 * context into. This supervisor owns that: it keeps the engine children alive
 * for a short grace period so switching back and forth does not pay the spawn
 * cost every time, and guarantees the conversation is never left unbound.
 *
 * It is scoped to a single client connection. The {@link SessionSink} is
 * constant for that connection's lifetime, which is what makes reuse safe.
 */
export interface EngineSupervisor {
  /** The engine the conversation is bound to right now. */
  readonly current: AgentSession;
  readonly currentEngineId: string;

  /**
   * Bind the conversation to `engineId`. Reuses a still-warm child when one is
   * available, otherwise spawns. The returned session is always freshly
   * `session/new`'d — the caller injects any carry-forward context on the
   * first prompt.
   *
   * The previous engine is released (kept warm for {@link idleGraceMs}, then
   * killed). Acquiring the next engine happens before releasing the current
   * one, so there is no window where the conversation is unbound.
   */
  switchTo(engineId: string): Promise<AgentSession>;

  /** Kill every engine child. Call on connection close / host shutdown. */
  killAll(): void;
}

interface WarmEngine {
  session: AgentSession;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface CreateSupervisorOptions {
  task: TaskContract;
  sink: SessionSink;
  policy?: PermissionPolicy;
  engineId?: string;
  resumeSessionId?: string | null;
  /** How long an unreferenced engine child lives before it is killed. */
  idleGraceMs?: number;
}

export async function createEngineSupervisor(
  options: CreateSupervisorOptions,
): Promise<EngineSupervisor> {
  const idleGraceMs = options.idleGraceMs ?? 30_000;
  const warm = new Map<string, WarmEngine>();

  let currentEngineId = options.engineId ?? DEFAULT_ENGINE_ID;

  const open = (engineId: string, resumeSessionId?: string | null) =>
    openSession({
      task: options.task,
      sink: options.sink,
      policy: options.policy,
      engineId,
      resumeSessionId,
    });

  const first = await open(currentEngineId, options.resumeSessionId);
  warm.set(currentEngineId, { session: first });

  const cancelIdle = (entry: WarmEngine) => {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
  };

  return {
    get current() {
      return warm.get(currentEngineId)!.session;
    },
    get currentEngineId() {
      return currentEngineId;
    },

    async switchTo(engineId: string) {
      if (engineId === currentEngineId) return warm.get(engineId)!.session;

      // Acquire next before releasing current.
      let next = warm.get(engineId);
      if (next) {
        cancelIdle(next);
        // A warm child still holds its old ACP session; give the caller a
        // clean one so carry-forward context is always the whole story.
        await next.session.newSession();
      } else {
        next = { session: await open(engineId) };
        warm.set(engineId, next);
      }

      const prevEngineId = currentEngineId;
      const prev = warm.get(prevEngineId);
      currentEngineId = engineId;

      if (prev) {
        prev.idleTimer = setTimeout(() => {
          if (warm.get(prevEngineId) === prev) warm.delete(prevEngineId);
          prev.session.close();
        }, idleGraceMs);
      }

      return next.session;
    },

    killAll() {
      for (const entry of warm.values()) {
        cancelIdle(entry);
        entry.session.close();
      }
      warm.clear();
    },
  };
}
