import {
  MAX_ARRAY_ITEMS,
  MAX_FIELD_CHARS,
  MAX_FIELD_COUNT,
  MAX_VALUE_DEPTH,
} from "./constants.ts";
import type { LogFields, LogRecord } from "./types.ts";

const WHITESPACE_RUN = /\s+/g;
const RESERVED_KEYS: ReadonlySet<string> = new Set(["time", "level", "component", "message"]);

function capText(text: string): string {
  const flat = text.replace(WHITESPACE_RUN, " ").trim();
  const overflow = flat.length - MAX_FIELD_CHARS;
  return overflow > 0 ? `${flat.slice(0, MAX_FIELD_CHARS)} (+${overflow} more chars)` : flat;
}

function capValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return capText(value);
  if (value instanceof Error) return capText(`${value.name}: ${value.message}`);
  if (Array.isArray(value)) {
    if (depth >= MAX_VALUE_DEPTH) return `${value.length} items`;
    const shown = value.slice(0, MAX_ARRAY_ITEMS).map((item) => capValue(item, depth + 1));
    const hidden = value.length - shown.length;
    return hidden > 0 ? [...shown, `(+${hidden} more)`] : shown;
  }
  if (typeof value === "object") {
    if (depth >= MAX_VALUE_DEPTH) return "object";
    return capFieldsAt(value as LogFields, depth + 1);
  }
  return capText(String(value));
}

function capFieldsAt(fields: LogFields, depth: number): Record<string, unknown> {
  const capped: Record<string, unknown> = {};
  for (const key of Object.keys(fields).sort().slice(0, MAX_FIELD_COUNT)) {
    const value = fields[key];
    if (value === undefined) continue;
    capped[key] = capValue(value, depth);
  }
  return capped;
}

function capFields(fields: LogFields): Record<string, unknown> {
  return capFieldsAt(fields, 0);
}

export function formatRecord(record: LogRecord): string {
  const payload: Record<string, unknown> = {
    time: record.time,
    level: record.level,
    component: record.component,
    message: capText(record.message),
  };
  for (const [key, value] of Object.entries(capFields(record.fields))) {
    if (RESERVED_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return JSON.stringify(payload);
}
