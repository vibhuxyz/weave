import {
  isRecord,
  parseJsonBlock,
  readString,
  readStringList,
  type FieldContext,
} from "../shared/index.ts";
import { MAX_AFFECTED_SYMBOLS, MAX_CHANGE_TEXT_CHARS, MAX_SYMBOL_CHARS } from "./constants.ts";
import type { ParseContractChangeResult } from "./types.ts";

export function parseContractChangeRequest(raw: unknown): ParseContractChangeResult {
  if (!isRecord(raw)) return { ok: false, issues: ["Contract change request must be an object"] };

  const issues: string[] = [];
  const ctx: FieldContext = { record: raw, where: "Contract change request", issues };
  const from = readString(ctx, "from", MAX_CHANGE_TEXT_CHARS);
  const to = readString(ctx, "to", MAX_CHANGE_TEXT_CHARS);
  const reason = readString(ctx, "reason", MAX_CHANGE_TEXT_CHARS);
  const affects = readStringList(ctx, "affects", { maxItems: MAX_AFFECTED_SYMBOLS, maxChars: MAX_SYMBOL_CHARS });
  if (affects.length === 0) issues.push(`${ctx.where}: "affects" must name at least one symbol`);

  if (issues.length > 0 || from === null || to === null || reason === null) return { ok: false, issues };
  return { ok: true, request: { from, to, reason, affects } };
}

const JSON_FENCES = /```json\r?\n([\s\S]*?)\r?\n```/g;
const REQUEST_KEY = "contractChangeRequest";

export function extractContractChangeRequest(message: string): ParseContractChangeResult | null {
  for (const match of message.matchAll(JSON_FENCES)) {
    const parsed = parseJsonBlock(match[1] ?? "");
    if (parsed.ok && isRecord(parsed.value) && REQUEST_KEY in parsed.value) {
      return parseContractChangeRequest(parsed.value[REQUEST_KEY]);
    }
  }
  return null;
}
