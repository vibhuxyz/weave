import { HISTORY_ARCHIVE_VERSION, SESSION_ID_PATTERN } from "./constants.ts";
import type { HistoryArchive, ParseResult } from "./types.ts";

const TURN_ROLES: ReadonlySet<string> = new Set(["user", "assistant", "notice"]);

export function isSafeSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === "string" && SESSION_ID_PATTERN.test(sessionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTurnShape(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.role === "string" && TURN_ROLES.has(value.role);
}

export function parseArchive(raw: unknown): ParseResult<HistoryArchive> {
  if (!isRecord(raw)) return { ok: false, reason: "archive is not an object" };
  if (!isSafeSessionId(raw.sessionId)) return { ok: false, reason: "archive has an invalid sessionId" };
  if (!Array.isArray(raw.turns)) return { ok: false, reason: "archive turns is not an array" };
  const badIndex = raw.turns.findIndex((turn) => !isTurnShape(turn));
  if (badIndex >= 0) return { ok: false, reason: `archive turn ${badIndex} has no id or a known role` };
  const dropped = raw.droppedTurnCount;
  if (typeof dropped !== "number" || !Number.isInteger(dropped) || dropped < 0) {
    return { ok: false, reason: "archive droppedTurnCount is not a non-negative integer" };
  }
  return {
    ok: true,
    value: { version: HISTORY_ARCHIVE_VERSION, sessionId: raw.sessionId, turns: raw.turns, droppedTurnCount: dropped },
  };
}
