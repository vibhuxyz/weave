import type { ProjectModel, Workspace } from "../types.ts";
import { searchVectors } from "../vectors/index.ts";
import { indexModel, rankFiles } from "./rank-files.ts";
import { callNeighbours, changesTouching, fileNeighbours } from "./related.ts";
import { wordsOf } from "../words/index.ts";
import { requestTermsOf } from "./terms.ts";
import type { ProjectAnswer, RankedFile, RankedSymbol } from "./types.ts";
import { relevantTests, verificationCommands } from "./verification.ts";

const MAX_FILES = 12;
const MAX_SYMBOLS = 20;
const MAX_APIS = 15;
const MAX_EVENTS = 10;
const RELATIVE_SCORE_FLOOR = 0.25;

function chooseApplication(files: readonly RankedFile[], workspaces: readonly Workspace[]): Workspace | null {
  const weight = new Map<string, number>();
  for (const file of files) if (file.workspace) weight.set(file.workspace, (weight.get(file.workspace) ?? 0) + file.score);
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  return [...weight]
    .flatMap(([name, score]) => {
      const workspace = byName.get(name);
      return workspace ? [{ workspace, score: score * (workspace.kind === "application" ? 2 : 1) }] : [];
    })
    .sort((a, b) => b.score - a.score || a.workspace.dir.localeCompare(b.workspace.dir))[0]?.workspace ?? null;
}

function matchingTerms(terms: readonly string[], text: string): readonly string[] {
  const words = new Set(wordsOf(text));
  return terms.filter((term) => words.has(term));
}

function similarFiles(model: ProjectModel, request: string): readonly RankedFile[] {
  const workspaceOf = new Map(model.files.map((file) => [file.path, file.workspace]));
  const best = new Map<string, { readonly score: number; readonly reason: string }>();
  for (const hit of searchVectors(model, request, MAX_FILES * 2)) {
    if (!best.has(hit.file)) best.set(hit.file, { score: hit.score, reason: `similar ${hit.kind} ${hit.id}` });
  }
  return [...best].map(([path, entry]) => ({ path, workspace: workspaceOf.get(path) ?? null, score: entry.score, matchedTerms: [], reasons: [entry.reason] }));
}

export function queryProject(model: ProjectModel, request: string): ProjectAnswer {
  const parsed = requestTermsOf(request);
  const lexical = rankFiles(model, indexModel(model), parsed);
  const ranked = lexical.length > 0 ? lexical : similarFiles(model, request);
  const floor = (ranked[0]?.score ?? 0) * RELATIVE_SCORE_FLOOR;
  const files = ranked.filter((file) => file.score >= floor).slice(0, MAX_FILES);
  const fileSet = new Set(files.map((file) => file.path));
  const workspaces = [...model.applications, ...model.packages];
  const application = chooseApplication(files, workspaces);
  const fileRank = new Map(files.map((file, rank) => [file.path, rank]));
  const symbols: readonly RankedSymbol[] = model.symbols
    .filter((symbol) => fileSet.has(symbol.file))
    .map((symbol) => ({ symbol, matchedTerms: matchingTerms(parsed.terms, symbol.name) }))
    .filter((entry) => entry.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || (fileRank.get(a.symbol.file) ?? 0) - (fileRank.get(b.symbol.file) ?? 0) || a.symbol.line - b.symbol.line)
    .slice(0, MAX_SYMBOLS);
  const symbolIds = new Set(symbols.map((entry) => entry.symbol.id));
  const testFiles = new Set(model.files.filter((file) => file.kind === "test").map((file) => file.path));
  const productApis = model.apis.filter((api) => !testFiles.has(api.file));
  const matchingApis = productApis.filter((api) => matchingTerms(parsed.terms, `${api.path} ${api.handler ?? ""}`).length > 0);
  const apis = (matchingApis.length > 0 ? matchingApis : productApis.filter((api) => fileSet.has(api.file))).slice(0, MAX_APIS);
  const owners = workspaces.filter((workspace) => workspace === application || files.some((file) => file.workspace === workspace.name));
  return {
    request,
    terms: parsed.terms,
    application: application ? { name: application.name, dir: application.dir, kind: application.kind } : null,
    files,
    symbols,
    dependencies: { ...fileNeighbours(model, fileSet), ...callNeighbours(model, symbolIds, fileSet) },
    apis,
    events: model.events.filter((event) => !testFiles.has(event.file) && (fileSet.has(event.file) || matchingTerms(parsed.terms, event.name).length > 0)).slice(0, MAX_EVENTS),
    recentChanges: changesTouching(model, fileSet),
    verification: { tests: relevantTests(model, fileSet, parsed.terms), commands: verificationCommands(model, owners) },
  };
}
