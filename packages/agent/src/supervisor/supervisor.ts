import { openSession } from "../session/index.ts";
import { DEFAULT_ENGINE_ID } from "../engines/index.ts";
import type {
  CreateSupervisorOptions,
  EngineSupervisor,
  WarmEngine,
} from "./types.ts";

function cancelIdleTimer(entry: WarmEngine): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }
}

function scheduleIdleRelease(
  warm: Map<string, WarmEngine>,
  engineId: string,
  graceMs: number,
): void {
  const target = warm.get(engineId);
  if (!target) return;

  target.idleTimer = setTimeout(() => {
    if (warm.get(engineId) === target) {
      warm.delete(engineId);
    }
    target.session.close();
  }, graceMs);
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
      sandboxed: options.sandboxed ?? options.task.sandboxed,
      stallTimeoutMs: options.stallTimeoutMs,
    });

  const first = await open(currentEngineId, options.resumeSessionId);
  warm.set(currentEngineId, { session: first });

  return {
    get current() {
      const active = warm.get(currentEngineId);
      if (!active) {
        throw new Error(`No active engine session for ${currentEngineId}`);
      }
      return active.session;
    },
    get currentEngineId() {
      return currentEngineId;
    },

    async reviveCurrent() {
      const entry = warm.get(currentEngineId);
      if (entry?.session.alive) return entry.session;

      // Resume what the dead engine was working on. Without this the
      // replacement starts cold and the user's next message lands in a
      // session that knows nothing about the conversation on screen.
      // `openSession` falls back to a new session when the resume is refused.
      const interrupted = entry?.session.sessionId ?? null;
      if (entry) {
        cancelIdleTimer(entry);
        warm.delete(currentEngineId);
      }
      const fresh: WarmEngine = { session: await open(currentEngineId, interrupted) };
      warm.set(currentEngineId, fresh);
      return fresh.session;
    },

    async switchTo(engineId: string) {
      const existing = warm.get(engineId);
      if (engineId === currentEngineId && existing) {
        return existing.session;
      }

      let next: WarmEngine;
      if (existing) {
        cancelIdleTimer(existing);
        await existing.session.newSession();
        next = existing;
      } else {
        next = { session: await open(engineId) };
        warm.set(engineId, next);
      }

      const prevEngineId = currentEngineId;
      currentEngineId = engineId;
      scheduleIdleRelease(warm, prevEngineId, idleGraceMs);

      return next.session;
    },

    killAll() {
      for (const entry of warm.values()) {
        cancelIdleTimer(entry);
        entry.session.close();
      }
      warm.clear();
    },
  };
}
