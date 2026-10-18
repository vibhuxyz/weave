import { HANDOFF_BLOCK, MAX_HANDOFF_JSON_CHARS, MAX_HANDOFF_REASON_CHARS } from "./constants.ts";
import type { HandoffParse, HandoffReading, TeamHandoff } from "./types.ts";
import { clip, readRemaining, stringItems } from "./validate-handoff.ts";

const HANDOFF_OPEN = /```weave-handoff\b/g;

type ParsedJson = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: string };

function lastBlockBody(text: string): string | null {
  return [...text.matchAll(HANDOFF_BLOCK)].map((match) => match[1] ?? "").at(-1) ?? null;
}

function parseJson(body: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, issue: error.message };
    throw error;
  }
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

export function handoffFromValue(value: unknown): HandoffParse {
  const fields = fieldsOf(value);
  if (fields === null) return { ok: false, issues: ["weave_handoff arguments must be an object with reason, done, remaining, and findings"] };
  const issues: string[] = [];
  const reason = fields.reason;
  if (typeof reason !== "string" || reason.trim() === "") issues.push("reason must be a non-empty string");
  const done = stringItems(fields.done, "done", issues);
  const findings = stringItems(fields.findings, "findings", issues);
  const remaining = readRemaining(fields.remaining, issues);
  if (remaining.length === 0) issues.push("remaining must list each piece of work, the folders it changes, and what it waits for");
  if (issues.length > 0 || typeof reason !== "string") return { ok: false, issues };
  const handoff: TeamHandoff = { reason: clip(reason, MAX_HANDOFF_REASON_CHARS), done, remaining, findings };
  return { ok: true, handoff };
}

export function unclosedHandoff(text: string): boolean {
  const opens = text.match(new RegExp(HANDOFF_OPEN.source, "g"))?.length ?? 0;
  const closed = text.match(new RegExp(HANDOFF_BLOCK.source, "g"))?.length ?? 0;
  return opens > closed;
}

export function readTeamHandoff(text: string): HandoffReading {
  const body = lastBlockBody(text);
  if (body === null) return { kind: "none" };
  if (body.length > MAX_HANDOFF_JSON_CHARS) return { kind: "invalid", issue: `the handoff block is over ${MAX_HANDOFF_JSON_CHARS} characters` };
  const parsed = parseJson(body);
  if (!parsed.ok) return { kind: "invalid", issue: `the handoff block is not valid JSON: ${parsed.issue}` };
  const handoff = handoffFromValue(parsed.value);
  if (!handoff.ok) return { kind: "invalid", issue: handoff.issues.join("; ") };
  return { kind: "handoff", handoff: handoff.handoff };
}
