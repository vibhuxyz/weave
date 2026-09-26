import { isRecord, readChoice, readStringList, type FieldContext } from "../shared/index.ts";
import { DOMAIN_PATTERN, MAX_DOMAINS, MAX_SKILL_NAME_CHARS, REQUEST_RISKS, REQUEST_SCOPES, REQUEST_TYPES } from "./constants.ts";
import type { PlanClassification } from "./types.ts";

function readDomains(ctx: FieldContext): string[] {
  const domains = readStringList(ctx, "domains", { maxItems: MAX_DOMAINS, maxChars: MAX_SKILL_NAME_CHARS });
  for (const domain of domains.filter((candidate) => !DOMAIN_PATTERN.test(candidate))) {
    ctx.issues.push(`${ctx.where}: "domains" entry ${JSON.stringify(domain)} must be a lowercase word like "backend"`);
  }
  return domains;
}

export function parseClassification(raw: unknown, issues: string[]): PlanClassification | null {
  if (raw === undefined) return null;
  if (!isRecord(raw)) {
    issues.push('Plan: "classification" must be an object');
    return null;
  }
  const ctx: FieldContext = { record: raw, where: "Plan classification", issues };
  const issuesBefore = issues.length;
  const taskType = readChoice(ctx, "taskType", REQUEST_TYPES);
  const scope = readChoice(ctx, "scope", REQUEST_SCOPES);
  const risk = readChoice(ctx, "risk", REQUEST_RISKS);
  const domains = readDomains(ctx);
  if (issues.length > issuesBefore || taskType === null || scope === null || risk === null) return null;
  return { taskType, scope, risk, domains };
}
