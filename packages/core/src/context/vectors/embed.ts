import { wordsOf } from "../words/index.ts";

export type SparseVector = ReadonlyMap<number, number>;

const DIMENSIONS = 1 << 16;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const TRIGRAM = 3;
const WORD_WEIGHT = 1;
const TRIGRAM_WEIGHT = 0.5;

function bucket(feature: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < feature.length; index += 1) {
    hash ^= feature.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash % DIMENSIONS;
}

export function featuresOf(text: string): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  const add = (feature: string, weight: number) => {
    const key = bucket(feature);
    counts.set(key, (counts.get(key) ?? 0) + weight);
  };
  for (const word of wordsOf(text)) {
    add(`w:${word}`, WORD_WEIGHT);
    const padded = `_${word}_`;
    for (let start = 0; start + TRIGRAM <= padded.length; start += 1) add(`t:${padded.slice(start, start + TRIGRAM)}`, TRIGRAM_WEIGHT);
  }
  return counts;
}

export function weighted(features: ReadonlyMap<number, number>, idf: ReadonlyMap<number, number>): SparseVector {
  const vector = new Map([...features].map(([key, count]) => [key, count * (idf.get(key) ?? 1)] as const));
  const norm = Math.sqrt([...vector.values()].reduce((total, value) => total + value * value, 0)) || 1;
  return new Map([...vector].map(([key, value]) => [key, value / norm] as const));
}

export function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let total = 0;
  for (const [key, value] of small) total += value * (large.get(key) ?? 0);
  return total;
}
