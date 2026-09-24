import type { ProjectModel } from "../types.ts";
import { cosine, featuresOf, weighted, type SparseVector } from "./embed.ts";

export type VectorDocKind = "file" | "symbol" | "api";

export interface VectorHit {
  readonly kind: VectorDocKind;
  readonly id: string;
  readonly file: string;
  readonly score: number;
}

interface VectorDoc {
  readonly kind: VectorDocKind;
  readonly id: string;
  readonly file: string;
  readonly vector: SparseVector;
}

export interface VectorIndex {
  readonly docs: readonly VectorDoc[];
  readonly idf: ReadonlyMap<number, number>;
}

const DEFAULT_LIMIT = 10;
const MIN_SCORE = 0.1;
const cache = new WeakMap<ProjectModel, VectorIndex>();

function sourceTexts(model: ProjectModel): readonly { readonly kind: VectorDocKind; readonly id: string; readonly file: string; readonly text: string }[] {
  const tests = new Set(model.files.filter((file) => file.kind === "test").map((file) => file.path));
  const symbols = model.symbols.filter((symbol) => !tests.has(symbol.file));
  return [
    ...model.files.filter((file) => file.kind === "source").map((file) => ({ kind: "file" as const, id: file.path, file: file.path, text: file.path })),
    ...symbols.map((symbol) => ({ kind: "symbol" as const, id: symbol.id, file: symbol.file, text: `${symbol.name} ${symbol.name}` })),
    ...model.apis.filter((api) => !tests.has(api.file)).map((api) => ({ kind: "api" as const, id: `${api.method} ${api.path} @${api.file}:${api.line}`, file: api.file, text: `${api.path} ${api.handler ?? ""}` })),
  ];
}

export function vectorIndexOf(model: ProjectModel): VectorIndex {
  const cached = cache.get(model);
  if (cached) return cached;
  const texts = sourceTexts(model);
  const features = texts.map((entry) => featuresOf(entry.text));
  const documentFrequency = new Map<number, number>();
  for (const feature of features) for (const key of feature.keys()) documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1);
  const idf = new Map([...documentFrequency].map(([key, count]) => [key, Math.log(1 + texts.length / count)] as const));
  const docs = texts.map((entry, index) => ({ kind: entry.kind, id: entry.id, file: entry.file, vector: weighted(features[index] ?? new Map(), idf) }));
  const index = { docs, idf };
  cache.set(model, index);
  return index;
}

export function searchVectors(model: ProjectModel, query: string, limit = DEFAULT_LIMIT): readonly VectorHit[] {
  const index = vectorIndexOf(model);
  const vector = weighted(featuresOf(query), index.idf);
  return index.docs
    .map((doc) => ({ kind: doc.kind, id: doc.id, file: doc.file, score: cosine(vector, doc.vector) }))
    .filter((hit) => hit.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
