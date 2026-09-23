import { MAX_REMEMBERED_SESSIONS } from "./constants";

export type CompactionCapabilities = ReadonlyMap<string, boolean>;

export function rememberCapability(
  capabilities: CompactionCapabilities,
  sessionId: string,
  supportsCompaction: boolean,
): CompactionCapabilities {
  const next = new Map(capabilities);
  next.delete(sessionId);
  next.set(sessionId, supportsCompaction);
  const oldest = next.keys().next();
  if (next.size > MAX_REMEMBERED_SESSIONS && !oldest.done) next.delete(oldest.value);
  return next;
}
