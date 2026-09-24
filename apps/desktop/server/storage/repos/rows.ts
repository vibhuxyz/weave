type Row = Record<string, unknown>;

export function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

export function stringField(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Database row field ${key} is not text`);
  return value;
}

export function optionalStringField(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Database row field ${key} is not text`);
  return value;
}

export function isoFromMs(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

export function msFromIso(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Database timestamp ${iso} is not ISO 8601`);
  return ms;
}
