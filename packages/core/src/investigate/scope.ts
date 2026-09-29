import { queryProject, renderProjectContext, type ProjectAnswer, type ProjectModel } from "../context/index.ts";
import { MAX_SCOPE_FILES, MAX_SCOPE_REASONS, MAX_SCOPE_SYMBOLS } from "./constants.ts";
import type { DiscoveryScope, DiscoveryTask, Question } from "./types.ts";

const CONSTRAINTS: readonly string[] = [
  "Read only. Do not edit, create or delete any file.",
  "Stay inside the files listed in the scope; name any file you had to open outside it.",
  "Report what the code does, not what it should do. Do not propose a fix.",
  "Every claim must name a file, and a symbol when one applies.",
  "Say so plainly when the evidence does not answer the question.",
];

const DEFAULT_OUTPUTS: readonly string[] = ["a finding with its supporting evidence"];
const INHERITED_REASON = "inherited from the investigation region: the question matched no file by name";

interface Scoped {
  readonly question: Question;
  readonly answer: ProjectAnswer;
  readonly anchored: readonly string[];
}

function anchoredFiles(answer: ProjectAnswer): readonly string[] {
  return answer.files.filter((file) => file.matchedTerms.length > 0).map((file) => file.path);
}

function regionOf(scoped: readonly Scoped[]): readonly string[] {
  const best = new Map<string, number>();
  for (const entry of scoped) {
    for (const file of entry.answer.files) {
      if (file.matchedTerms.length === 0) continue;
      best.set(file.path, Math.max(best.get(file.path) ?? 0, file.score));
    }
  }
  return [...best]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([path]) => path);
}

function scopeOf(entry: Scoped, region: readonly string[]): DiscoveryScope {
  const inherited = entry.anchored.length === 0;
  const chosen = (inherited ? region : entry.anchored).slice(0, MAX_SCOPE_FILES);
  const files = chosen.length > 0 ? chosen : entry.answer.files.slice(0, MAX_SCOPE_FILES).map((file) => file.path);
  const included = new Set(files);
  const reasonsByPath = new Map(entry.answer.files.map((file) => [file.path, file.reasons.join("; ")]));
  return {
    files,
    symbols: entry.answer.symbols
      .filter(({ symbol }) => included.has(symbol.file))
      .slice(0, MAX_SCOPE_SYMBOLS)
      .map(({ symbol }) => symbol.id),
    reasons: files
      .slice(0, MAX_SCOPE_REASONS)
      .map((path) => `${path}: ${inherited ? INHERITED_REASON : reasonsByPath.get(path) ?? "matched the question"}`),
  };
}

function taskOf(entry: Scoped, region: readonly string[]): DiscoveryTask {
  return {
    id: `discover-${entry.question.id.toLowerCase()}`,
    questionId: entry.question.id,
    question: entry.question.question,
    scope: scopeOf(entry, region),
    context: renderProjectContext(entry.answer),
    constraints: CONSTRAINTS,
    expectedOutputs: entry.question.expectedOutputs.length > 0 ? entry.question.expectedOutputs : DEFAULT_OUTPUTS,
  };
}

export function scopeQuestions(
  request: string,
  questions: readonly Question[],
  model: ProjectModel,
): readonly DiscoveryTask[] {
  const scoped: Scoped[] = questions.map((question) => {
    const answer = queryProject(model, `${request} ${question.question}`);
    return { question, answer, anchored: anchoredFiles(answer) };
  });
  const region = regionOf(scoped);
  return scoped.map((entry) => taskOf(entry, region));
}

export interface ScopeInput {
  readonly request: string;
  readonly question: Question;
  readonly model: ProjectModel;
}

export function scopeQuestion(input: ScopeInput): DiscoveryTask {
  const [task] = scopeQuestions(input.request, [input.question], input.model);
  if (!task) throw new Error(`Cannot scope question ${input.question.id}`);
  return task;
}
