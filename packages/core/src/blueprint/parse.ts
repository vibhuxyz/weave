import {
  isRecord,
  isSafeRelativeGlob,
  parseJsonBlock,
  readList,
  readPattern,
  readString,
  readStringList,
  type FieldContext,
} from "../shared/index.ts";
import {
  COMPONENT_NAME_PATTERN,
  MAX_COMPONENTS,
  MAX_COMPONENT_PATHS,
  MAX_PATH_CHARS,
  MAX_SMOKE_STEPS,
  MAX_STACK_CHARS,
  MAX_TEXT_CHARS,
} from "./constants.ts";
import { checkReferences, parseEndpoints, parseEvents } from "./parse-api.ts";
import { parseSchemas } from "./parse-schemas.ts";
import type { BlueprintComponent, ParseBlueprintResult } from "./types.ts";

function parseComponent(raw: unknown, where: string, issues: string[]): BlueprintComponent | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const name = readPattern(ctx, "name", COMPONENT_NAME_PATTERN);
  const responsibility = readString(ctx, "responsibility", MAX_TEXT_CHARS);
  const paths = readStringList(ctx, "paths", { maxItems: MAX_COMPONENT_PATHS, maxChars: MAX_PATH_CHARS });
  for (const path of paths.filter((candidate) => !isSafeRelativeGlob(candidate))) {
    issues.push(`${where}: path ${JSON.stringify(path)} must be a relative path inside the project`);
  }
  return name === null || responsibility === null ? null : { name, responsibility, paths };
}

export function parseBlueprint(text: string): ParseBlueprintResult {
  const parsed = parseJsonBlock(text);
  if (!parsed.ok) return { ok: false, issues: [parsed.issue] };
  if (!isRecord(parsed.value)) return { ok: false, issues: ["Blueprint must be a JSON object"] };

  const issues: string[] = [];
  const ctx: FieldContext = { record: parsed.value, where: "Blueprint", issues };
  const stack = readString(ctx, "stack", MAX_STACK_CHARS);
  const components = readList(ctx, "components", MAX_COMPONENTS, parseComponent);
  if (components.length === 0) issues.push("Blueprint must declare at least one component");
  const schemas = parseSchemas(ctx);
  const endpoints = parseEndpoints(ctx);
  const events = parseEvents(ctx);
  const smokeFlow = readStringList(ctx, "smokeFlow", { maxItems: MAX_SMOKE_STEPS, maxChars: MAX_TEXT_CHARS });
  if (smokeFlow.length === 0) issues.push("Blueprint must declare a smokeFlow");
  issues.push(...checkReferences(schemas, endpoints, events));

  if (issues.length > 0 || stack === null) return { ok: false, issues };
  return { ok: true, blueprint: { stack, components, schemas, endpoints, events, smokeFlow } };
}
