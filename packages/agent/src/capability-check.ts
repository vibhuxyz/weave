import type { EngineCapabilities } from "./engine-capabilities.ts";

interface LiveAgentCapabilities {
  loadSession?: boolean;
}

export function describeCapabilityMismatch(
  declared: EngineCapabilities,
  live: unknown,
): string | null {
  const loadSession = (live as LiveAgentCapabilities | undefined)?.loadSession;
  if (typeof loadSession !== "boolean") return null;
  if (loadSession !== declared.resume) {
    return `declared resume=${declared.resume} but engine reported loadSession=${loadSession}`;
  }
  return null;
}
