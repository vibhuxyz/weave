import { isRecord, parseJsonBlock, readChoice, readList, readString, readStringList, type FieldContext } from "../../shared/index.ts";
import {
  MAX_ISSUE_REASON_CHARS,
  MAX_ISSUE_TASK_IDS,
  MAX_NEW_TASK_ID_CHARS,
  MAX_REVIEW_ISSUES,
  REVIEW_ISSUE_TYPES,
  REVIEW_STATUSES,
} from "./constants.ts";
import type { ParseReviewResult, ReviewIssue } from "./types.ts";

function parseIssue(raw: unknown, where: string, issues: string[], knownIds: ReadonlySet<string>): ReviewIssue | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const issuesBefore = issues.length;
  const type = readChoice(ctx, "type", REVIEW_ISSUE_TYPES);
  const taskIds = readStringList(ctx, "taskIds", { maxItems: MAX_ISSUE_TASK_IDS, maxChars: MAX_NEW_TASK_ID_CHARS });
  const reason = readString(ctx, "reason", MAX_ISSUE_REASON_CHARS);
  const unknown = type === "missing_task" ? [] : taskIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) issues.push(`${where}: "taskIds" names tasks that are not in the plan: ${unknown.join(", ")}`);
  if (issues.length > issuesBefore || type === null || reason === null) return null;
  return { type, taskIds, reason };
}

export function parseReview(text: string, knownIds: ReadonlySet<string>): ParseReviewResult {
  const parsed = parseJsonBlock(text);
  if (!parsed.ok) return { ok: false, issues: [parsed.issue] };
  if (!isRecord(parsed.value)) return { ok: false, issues: ["Review must be a JSON object"] };
  const issues: string[] = [];
  const ctx: FieldContext = { record: parsed.value, where: "Review", issues };
  const status = readChoice(ctx, "status", REVIEW_STATUSES);
  const found = readList(ctx, "issues", MAX_REVIEW_ISSUES, (raw, where, itemIssues) => parseIssue(raw, where, itemIssues, knownIds));
  if (status === "approved" && found.length > 0) issues.push('Review: "approved" must not list issues');
  if (status === "changes_requested" && found.length === 0 && issues.length === 0) issues.push('Review: "changes_requested" must list at least one issue');
  if (issues.length > 0 || status === null) return { ok: false, issues };
  return { ok: true, verdict: status === "approved" ? { status } : { status, issues: found } };
}
