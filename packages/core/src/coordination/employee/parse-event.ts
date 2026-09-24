import { EMPLOYEE_EVENT_TYPES, RESOURCE_KINDS, type DependencyNeed, type EmployeeEventType, type ResourceKind } from "@weave/protocol";
import { isRecord, readOptionalString, readPattern, readString, type FieldContext } from "../../shared/index.ts";
import { MAX_EVENT_TEXT_CHARS, MAX_NAME_CHARS, OUTPUT_NAME_PATTERN } from "./constants.ts";
import { parseArtifact } from "./parse-artifact.ts";
import type { EmployeeSubmission, ParseSubmissionResult } from "./types.ts";

const WHERE = "Employee event";

function isEmployeeEventType(value: unknown): value is EmployeeEventType {
  return typeof value === "string" && (EMPLOYEE_EVENT_TYPES as readonly string[]).includes(value);
}

function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === "string" && (RESOURCE_KINDS as readonly string[]).includes(value);
}

function parseNeed(raw: unknown, issues: string[]): DependencyNeed | null {
  if (!isRecord(raw)) {
    issues.push(`${WHERE}: "need" must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where: `${WHERE} need`, issues };
  const output = readPattern(ctx, "output", OUTPUT_NAME_PATTERN);
  const task = readOptionalString(ctx, "task", MAX_NAME_CHARS);
  const resource = raw["resource"];
  const hasResource = isRecord(resource) && isResourceKind(resource["kind"]) && typeof resource["id"] === "string" && resource["id"].length <= MAX_EVENT_TEXT_CHARS;
  if (resource !== undefined && !hasResource) issues.push(`${WHERE} need: "resource" must be { kind, id } with a known kind`);
  if (output === null) return null;
  return {
    output,
    ...(task === null ? {} : { task }),
    ...(hasResource ? { resource: { kind: resource["kind"] as ResourceKind, id: String(resource["id"]) } } : {}),
  };
}

function parseData(type: EmployeeEventType, ctx: FieldContext): EmployeeSubmission | null {
  switch (type) {
    case "artifact.ready":
    case "artifact.updated":
    case "contract.published":
    case "contract.changed": {
      const artifact = parseArtifact(ctx.record["artifact"], `${WHERE} artifact`, ctx.issues);
      return artifact ? { type, data: { artifact } } : null;
    }
    case "task.blocked": {
      const reason = readString(ctx, "reason", MAX_EVENT_TEXT_CHARS);
      return reason === null ? null : { type, data: { reason } };
    }
    case "dependency.blocked": {
      const need = parseNeed(ctx.record["need"], ctx.issues);
      const reason = readString(ctx, "reason", MAX_EVENT_TEXT_CHARS);
      return need === null || reason === null ? null : { type, data: { need, reason } };
    }
    case "review.requested":
    case "verification.failed":
    case "verification.passed": {
      const summary = readString(ctx, "summary", MAX_EVENT_TEXT_CHARS);
      return summary === null ? null : { type, data: { summary } };
    }
    case "escalation.created": {
      const reason = readString(ctx, "reason", MAX_EVENT_TEXT_CHARS);
      const subject = readString(ctx, "subject", MAX_EVENT_TEXT_CHARS);
      return reason === null || subject === null ? null : { type, data: { reason, subject } };
    }
    default: {
      const unhandled: never = type;
      return unhandled;
    }
  }
}

export function parseEmployeeEvent(raw: unknown): ParseSubmissionResult {
  if (!isRecord(raw)) return { ok: false, issues: [`${WHERE} must be an object`] };
  const type = raw["type"];
  if (!isEmployeeEventType(type)) return { ok: false, issues: [`${WHERE}: "type" must be one of ${EMPLOYEE_EVENT_TYPES.join(", ")}`] };
  const data = raw["data"];
  if (!isRecord(data)) return { ok: false, issues: [`${WHERE}: "data" must be an object`] };
  const issues: string[] = [];
  const submission = parseData(type, { record: data, where: `${WHERE} ${type}`, issues });
  if (issues.length > 0 || submission === null) return { ok: false, issues };
  return { ok: true, submission };
}
