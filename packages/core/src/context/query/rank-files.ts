import { layerOf } from "../architecture/index.ts";
import type { ApiFact, EventFact, Layer, ProjectModel, SymbolFact } from "../types.ts";
import { wordsOf } from "../words/index.ts";
import type { Intent, RankedFile, RequestTerms } from "./types.ts";

const PATH_WEIGHT = 3;
const SYMBOL_WEIGHT = 2;
const API_WEIGHT = 2;
const API_INTENT_WEIGHT = 4;
const EVENT_WEIGHT = 1;
const LAYER_BONUS = 2;
const MAX_REASONS = 4;
const INTENT_LAYERS: Readonly<Record<Intent, readonly Layer[]>> = {
  api: ["api", "contract", "service"], ui: ["ui", "state"], data: ["data"], event: ["service"], test: ["test"],
};

function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function matched(terms: readonly string[], text: string): readonly string[] {
  const words = new Set(wordsOf(text));
  return terms.filter((term) => words.has(term));
}

export interface FileIndex {
  readonly symbolsByFile: ReadonlyMap<string, readonly SymbolFact[]>;
  readonly apisByFile: ReadonlyMap<string, readonly ApiFact[]>;
  readonly eventsByFile: ReadonlyMap<string, readonly EventFact[]>;
}

export function indexModel(model: ProjectModel): FileIndex {
  return {
    symbolsByFile: groupBy(model.symbols, (symbol) => symbol.file),
    apisByFile: groupBy(model.apis, (api) => api.file),
    eventsByFile: groupBy(model.events, (event) => event.file),
  };
}

interface FileHits {
  readonly path: string;
  readonly workspace: string | null;
  readonly layer: Layer;
  readonly hits: ReadonlyMap<string, number>;
  readonly reasons: readonly string[];
}

function hitsOf(path: string, index: FileIndex, request: RequestTerms): Pick<FileHits, "hits" | "reasons"> {
  const { terms, intents } = request;
  const hits = new Map<string, number>();
  const reasons: string[] = [];
  const add = (found: readonly string[], weight: number, reason: string) => {
    if (found.length === 0) return;
    for (const term of found) hits.set(term, Math.max(hits.get(term) ?? 0, weight));
    if (reasons.length < MAX_REASONS) reasons.push(reason);
  };
  add(matched(terms, path), PATH_WEIGHT, "path");
  for (const symbol of index.symbolsByFile.get(path) ?? []) add(matched(terms, symbol.name), SYMBOL_WEIGHT, `symbol ${symbol.name}`);
  const apiWeight = intents.has("api") ? API_INTENT_WEIGHT : API_WEIGHT;
  for (const api of index.apisByFile.get(path) ?? []) add(matched(terms, `${api.path} ${api.handler ?? ""}`), apiWeight, `${api.source} ${api.method} ${api.path}`);
  for (const event of index.eventsByFile.get(path) ?? []) add(matched(terms, event.name), EVENT_WEIGHT, `event ${event.name}`);
  return { hits, reasons };
}

function rarityWeights(files: readonly FileHits[], totalFiles: number): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) for (const term of file.hits.keys()) counts.set(term, (counts.get(term) ?? 0) + 1);
  return new Map([...counts].map(([term, count]) => [term, 1 + Math.log(totalFiles / (1 + count))]));
}

function scored(file: FileHits, rarity: ReadonlyMap<string, number>, request: RequestTerms): RankedFile {
  const base = [...file.hits].reduce((total, [term, weight]) => total + weight * (rarity.get(term) ?? 1), 0);
  const coverage = file.hits.size / request.terms.length;
  const bonus = [...request.intents].some((intent) => INTENT_LAYERS[intent].includes(file.layer)) ? LAYER_BONUS : 0;
  return { path: file.path, workspace: file.workspace, score: (base + bonus) * coverage ** 2, matchedTerms: [...file.hits.keys()].sort(), reasons: file.reasons };
}

export function rankFiles(model: ProjectModel, index: FileIndex, request: RequestTerms): readonly RankedFile[] {
  if (request.terms.length === 0) return [];
  const candidates = model.files.filter((file) => file.kind === "source" || file.kind === "manifest");
  const hit = candidates
    .map((file) => ({ path: file.path, workspace: file.workspace, layer: layerOf(file.path, file.kind), ...hitsOf(file.path, index, request) }))
    .filter((file) => file.hits.size > 0);
  const rarity = rarityWeights(hit, candidates.length);
  return hit
    .map((file) => scored(file, rarity, request))
    .sort((a, b) => b.score - a.score || b.matchedTerms.length - a.matchedTerms.length || a.path.localeCompare(b.path));
}
