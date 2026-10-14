import {
  CLIPPED_MARK,
  HANDOFF_BLOCK,
  MAX_HANDOFF_ITEM_CHARS,
  MAX_HANDOFF_ITEMS,
  MAX_HANDOFF_JSON_CHARS,
  MAX_HANDOFF_REASON_CHARS,
} from "./constants.ts";
import type { HandoffParse, HandoffReading, TeamHandoff } from "./types.ts";

const PATH_TOKEN = /(?:^|[\s`'"(])(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.-]+/;
const HANDOFF_OPEN = /```weave-handoff\b/g;

type ParsedJson = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: string };

function clip(text: string, maxChars: number): string {
  const characters = [...text.replace(/\s+/g, " ").trim()];
  if (characters.length <= maxChars) return characters.join("");
  return `${characters.slice(0, maxChars - CLIPPED_MARK.length).join("")}${CLIPPED_MARK}`;
}

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

function stringItems(raw: unknown, field: string, issues: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push(`${field} must be an array of strings`);
    return [];
  }
  if (raw.length > MAX_HANDOFF_ITEMS) issues.push(`${field} has more than ${MAX_HANDOFF_ITEMS} items`);
  const items: string[] = [];
  for (const [index, item] of raw.slice(0, MAX_HANDOFF_ITEMS).entries()) {
    if (typeof item !== "string" || item.trim() === "") issues.push(`${field}[${index}] must be a non-empty string`);
    else items.push(clip(item, MAX_HANDOFF_ITEM_CHARS));
  }
  return items;
}

export function handoffFromValue(value: unknown): HandoffParse {
  const fields = fieldsOf(value);
  if (fields === null) return { ok: false, issues: ["weave_handoff arguments must be an object with reason, done, remaining, and findings"] };
  const issues: string[] = [];
  const reason = fields.reason;
  if (typeof reason !== "string" || reason.trim() === "") issues.push('reason must be a non-empty string');
  const done = stringItems(fields.done, "done", issues);
  const remaining = stringItems(fields.remaining, "remaining", issues);
  const findings = stringItems(fields.findings, "findings", issues);
  if (remaining.length === 0) issues.push("remaining must list each piece of work and the folder it changes");
  remaining.forEach((item, index) => {
    if (!PATH_TOKEN.test(item)) issues.push(`remaining[${index}] must name a folder, such as apps/web`);
  });
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
