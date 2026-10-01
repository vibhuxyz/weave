import {
  CLIPPED_MARK,
  HANDOFF_BLOCK,
  MAX_HANDOFF_ITEM_CHARS,
  MAX_HANDOFF_ITEMS,
  MAX_HANDOFF_JSON_CHARS,
  MAX_HANDOFF_REASON_CHARS,
} from "./constants.ts";
import type { HandoffReading } from "./types.ts";

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

function itemsOf(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .slice(0, MAX_HANDOFF_ITEMS)
    .map((item) => clip(item, MAX_HANDOFF_ITEM_CHARS));
}

export function readTeamHandoff(text: string): HandoffReading {
  const body = lastBlockBody(text);
  if (body === null) return { kind: "none" };
  if (body.length > MAX_HANDOFF_JSON_CHARS) return { kind: "invalid", issue: `the handoff block is over ${MAX_HANDOFF_JSON_CHARS} characters` };
  const parsed = parseJson(body);
  if (!parsed.ok) return { kind: "invalid", issue: `the handoff block is not valid JSON: ${parsed.issue}` };
  const fields = fieldsOf(parsed.value);
  const reason = fields?.reason;
  if (typeof reason !== "string" || reason.trim() === "") return { kind: "invalid", issue: 'the handoff block needs a non-empty "reason"' };
  const handoff = { reason: clip(reason, MAX_HANDOFF_REASON_CHARS), done: itemsOf(fields?.done), remaining: itemsOf(fields?.remaining), findings: itemsOf(fields?.findings) };
  return { kind: "handoff", handoff };
}
