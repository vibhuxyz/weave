const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i;
const MAX_PATTERNED_CHARS = 256;

export type JsonRecord = Record<string, unknown>;

export type JsonBlockResult =
  | { ok: true; value: unknown }
  | { ok: false; issue: string };

export interface FieldContext {
  record: JsonRecord;
  where: string;
  issues: string[];
}

export function parseJsonBlock(text: string): JsonBlockResult {
  if (!text || text.trim() === "") {
    return { ok: false, issue: "No output received from the engine" };
  }

  // 1. Try fenced markdown code block (e.g. ```json ... ``` or ``` ...)
  const fencedMatch = JSON_FENCE.exec(text);
  if (fencedMatch?.[1]) {
    const fencedContent = fencedMatch[1].trim();
    if (fencedContent) {
      try {
        return { ok: true, value: JSON.parse(fencedContent) };
      } catch {
        // Fall through to other extraction methods
      }
    }
  }

  // 2. Try whole trimmed text
  const trimmed = text.trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    // Fall through
  }

  // 3. Try finding the outermost balanced { ... } object in the text
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim();
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Fall through
    }
  }

  // 4. Return syntax error from parsing the closest candidate or trimmed text
  try {
    JSON.parse(trimmed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, issue: `Output is not valid JSON: ${error.message}` };
    }
    throw error;
  }
  return { ok: false, issue: "Output is not valid JSON" };
}

export function unparsedIssue(issue: string, text: string, maxChars: number): string {
  const excerpt = text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  return excerpt === "" ? issue : `${issue}; the engine answered: ${JSON.stringify(excerpt)}`;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(ctx: FieldContext, key: string, maxChars: number): string | null {
  const value = ctx.record[key];
  if (typeof value !== "string" || value.trim() === "") {
    ctx.issues.push(`${ctx.where}: "${key}" must be a non-empty string`);
    return null;
  }
  if (value.length > maxChars) {
    ctx.issues.push(`${ctx.where}: "${key}" is longer than ${maxChars} characters`);
    return null;
  }
  return value;
}

export function readOptionalString(ctx: FieldContext, key: string, maxChars: number): string | null {
  const value = ctx.record[key];
  if (value === undefined || value === null) return null;
  return readString(ctx, key, maxChars);
}

export function readChoice<T extends string>(ctx: FieldContext, key: string, choices: readonly T[]): T | null {
  const value = ctx.record[key];
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) ctx.issues.push(`${ctx.where}: "${key}" must be one of ${choices.join(", ")}`);
  return choice ?? null;
}

export function readPattern(ctx: FieldContext, key: string, pattern: RegExp): string | null {
  const value = readString(ctx, key, MAX_PATTERNED_CHARS);
  if (value === null) return null;
  if (!pattern.test(value)) {
    ctx.issues.push(`${ctx.where}: "${key}" has an invalid format: ${JSON.stringify(value)}`);
    return null;
  }
  return value;
}

export function readList<T>(
  ctx: FieldContext,
  key: string,
  maxItems: number,
  parseItem: (raw: unknown, where: string, issues: string[]) => T | null,
): T[] {
  const value = ctx.record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.issues.push(`${ctx.where}: "${key}" must be an array`);
    return [];
  }
  if (value.length > maxItems) {
    ctx.issues.push(`${ctx.where}: "${key}" has ${value.length} items, the limit is ${maxItems}`);
    return [];
  }
  return value.flatMap((raw, index) => {
    const item = parseItem(raw, `${ctx.where} ${key}[${index}]`, ctx.issues);
    return item === null ? [] : [item];
  });
}

export function readStringList(
  ctx: FieldContext,
  key: string,
  limits: { maxItems: number; maxChars: number },
): string[] {
  return readList(ctx, key, limits.maxItems, (raw, where, issues) => {
    if (typeof raw === "string" && raw.trim() !== "" && raw.length <= limits.maxChars) return raw;
    issues.push(`${where} must be a non-empty string of at most ${limits.maxChars} characters`);
    return null;
  });
}
