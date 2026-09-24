import { isRecord, parseJsonBlock, readList, readString, type FieldContext } from "../shared/index.ts";
import { MAX_PLAN_TASKS, MAX_REASON_CHARS } from "./constants.ts";
import { validateGraph } from "./graph.ts";
import { parseTask } from "./parse-task.ts";
import type { ParsePlanResult } from "./types.ts";

function fail(...issues: string[]): ParsePlanResult {
  return { ok: false, issues };
}

export function parsePlan(text: string, cwd: string): ParsePlanResult {
  const parsed = parseJsonBlock(text);
  if (!parsed.ok) return fail(parsed.issue);
  if (!isRecord(parsed.value)) return fail("Plan must be a JSON object");

  const issues: string[] = [];
  const ctx: FieldContext = { record: parsed.value, where: "Plan", issues };

  if (typeof parsed.value.noChangeNeeded === "string") {
    const reason = readString(ctx, "noChangeNeeded", MAX_REASON_CHARS);
    if (parsed.value.tasks !== undefined) issues.push('Plan must not combine "noChangeNeeded" with "tasks"');
    return reason !== null && issues.length === 0
      ? { ok: true, plan: { status: "no-change-needed", reason } }
      : fail(...issues);
  }

  const tasks = readList(ctx, "tasks", MAX_PLAN_TASKS, (raw, where, taskIssues) =>
    parseTask(raw, where, taskIssues, cwd),
  );
  if (tasks.length === 0 && issues.length === 0) issues.push('Plan must contain at least one task or "noChangeNeeded"');
  if (issues.length === 0) issues.push(...validateGraph(tasks));
  return issues.length > 0 ? fail(...issues) : { ok: true, plan: { status: "ready", tasks } };
}
