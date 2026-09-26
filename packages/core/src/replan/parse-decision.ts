import { isRecord, parseJsonBlock, readChoice, readList, readOptionalString, readPattern, readString, type FieldContext } from "../shared/index.ts";
import { MAX_GUIDANCE_CHARS, MAX_REASON_CHARS, MAX_RERUN_TASKS, REPLAN_ACTIONS, TASK_ID_PATTERN } from "./constants.ts";
import type { ParseDecisionResult, ReplanRerun } from "./types.ts";

const WHERE = "Replan decision";
const MAX_ENGINE_CHARS = 64;
const ENGINE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function parseRerun(raw: unknown, where: string, issues: string[]): ReplanRerun | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const id = readPattern(ctx, "id", TASK_ID_PATTERN);
  const guidance = readOptionalString(ctx, "guidance", MAX_GUIDANCE_CHARS);
  const engine = readOptionalString(ctx, "engine", MAX_ENGINE_CHARS);
  if (engine !== null && !ENGINE_PATTERN.test(engine)) issues.push(`${where}: "engine" has an invalid format: ${JSON.stringify(engine)}`);
  if (id === null) return null;
  return { id, ...(guidance === null ? {} : { guidance }), ...(engine !== null && ENGINE_PATTERN.test(engine) ? { engine } : {}) };
}

export function parseReplanDecision(text: string): ParseDecisionResult {
  const parsed = parseJsonBlock(text);
  if (!parsed.ok) return { ok: false, issues: [parsed.issue] };
  if (!isRecord(parsed.value)) return { ok: false, issues: [`${WHERE} must be a JSON object`] };
  const issues: string[] = [];
  const ctx: FieldContext = { record: parsed.value, where: WHERE, issues };
  const action = readChoice(ctx, "action", REPLAN_ACTIONS);
  const reason = readString(ctx, "reason", MAX_REASON_CHARS);
  const rerun = readList(ctx, "rerun", MAX_RERUN_TASKS, parseRerun);
  if (issues.length > 0 || action === null || reason === null) return { ok: false, issues };
  const unique = rerun.filter((entry, index) => rerun.findIndex((other) => other.id === entry.id) === index);
  return { ok: true, decision: { action, reason, rerun: action === "rerun" ? unique : [] } };
}
