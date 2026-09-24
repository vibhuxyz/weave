const JSON_FENCE = /```json\r?\n([\s\S]*?)\r?\n```/;
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
  const source = (JSON_FENCE.exec(text)?.[1] ?? text).trim();
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, issue: `Output is not valid JSON: ${error.message}` };
    }
    throw error;
  }
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
