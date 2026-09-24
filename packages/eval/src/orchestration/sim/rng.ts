const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32_RANGE = 0x1_0000_0000;

export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = FNV_OFFSET;
  for (const char of parts.join("\u0000")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

export function uniform(...parts: readonly (string | number)[]): number {
  let state = hashSeed(...parts);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / UINT32_RANGE;
}

export function pick<T>(items: readonly T[], ...parts: readonly (string | number)[]): T {
  const item = items[Math.floor(uniform(...parts) * items.length)];
  if (item === undefined) throw new Error("pick: empty list");
  return item;
}

export function integerBetween(min: number, max: number, ...parts: readonly (string | number)[]): number {
  return min + Math.floor(uniform(...parts) * (max - min + 1));
}
