import { isRecord } from "../../shared/index.ts";

type RawMap = Readonly<Record<string, unknown>>;

export function mergeRaw(parent: RawMap, child: RawMap): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    const inherited = merged[key];
    merged[key] = isRecord(inherited) && isRecord(value) ? mergeRaw(inherited, value) : value;
  }
  return merged;
}
