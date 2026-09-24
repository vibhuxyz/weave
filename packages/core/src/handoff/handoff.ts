import type { Decision, TaskState, VerificationResult } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import type { EngineDescriptor } from "@weave/agent";
import type { Checkpoint } from "../checkpoint/index.ts";

const MAX_BRIEF_BYTES = 4096;
const MAX_LISTED = 8;

function section(heading: string, body: string): string {
  return `${heading}\n${body}`;
}

function listed(lines: readonly string[]): string {
  return lines.slice(-MAX_LISTED).map((line) => `  ${line.replace(/\s+/g, " ").trim()}`).join("\n");
}

function renderWorkspace(state: TaskState): string {
  const { gitState, changedFiles } = state;
  const changedCount = changedFiles.modified.length + changedFiles.created.length + changedFiles.deleted.length;
  const branch = gitState.branch ?? "(unknown branch)";
  const base = gitState.baseCommit ? gitState.baseCommit.slice(0, 8) : "(unknown base)";
  const dirtyNote = gitState.dirty.length > 0 ? ", uncommitted" : "";
  return [`${branch} · base ${base} · ${changedCount} file(s) changed${dirtyNote}`, "The previous worker's changes are already on disk. Do not recreate them."].join("\n");
}

function renderChanged(files: TaskState["changedFiles"]): string {
  const paths = [...new Set([...files.modified, ...files.created, ...files.deleted])];
  return paths.length === 0 ? "  (no files changed)" : paths.map((path) => `  ${path}`).join("\n");
}

function renderVerified(entries: readonly VerificationResult[]): string {
  if (entries.length === 0) return "  (nothing verified yet)";
  return entries.map((entry) => `  ${entry.rung.padEnd(11)} ${entry.status.padEnd(6)} rung ${rungStrength(entry.rung)}`).join("\n");
}

function optional(heading: string, lines: readonly string[]): readonly string[] {
  return lines.length === 0 ? [] : [section(heading, listed(lines))];
}

function renderBrief(state: TaskState, decisions: readonly Decision[], completed: readonly string[], verification: readonly VerificationResult[]): string {
  const unfinished = state.inFlight.map((tool) => `${tool.locations[0] ?? tool.title}   an edit was in progress when the previous worker stopped. Read it before editing.`);
  const doing = state.currentStep ?? `(last completed: ${completed.at(-1) ?? "nothing yet"})`;
  return [
    section("TASK", state.goal),
    section("WORKSPACE", renderWorkspace(state)),
    section("CHANGED", renderChanged(state.changedFiles)),
    section("VERIFIED  (deterministic — these actually ran)", renderVerified(verification)),
    ...optional("FAILURES  (recorded by Weave)", state.failures.map((failure) => `${failure.kind}: ${failure.message}`)),
    ...optional("UNFINISHED — verify before trusting", unfinished),
    ...optional("CLAIMED BY THE PREVIOUS WORKER  (unverified — treat as hints)", decisions.map((decision) => `"${decision.description}"`)),
    ...optional("DISCOVERIES", state.discoveries.map((discovery) => `${discovery.source === "worker" ? "(claimed) " : ""}${discovery.text}`)),
    ...optional("OPEN QUESTIONS", state.openQuestions.map((question) => question.text)),
    ...(state.currentStep || completed.length > 0 ? [section("WAS DOING", doing)] : []),
    ...(state.nextStep ? [section("NEXT STEP", state.nextStep)] : []),
    section("FIRST INSTRUCTION", "Read the changed files before editing them. The filesystem is authoritative; everything under CLAIMED is a hint from a worker that was interrupted."),
  ].join("\n\n");
}

export function buildBrief(checkpoint: Checkpoint, _next: EngineDescriptor): string {
  return briefOf(checkpoint.state, MAX_BRIEF_BYTES);
}

export function briefOf(state: TaskState, maxBytes: number): string {
  let decisions = state.decisions;
  let completed = state.completed;
  let verification = state.verification;
  let brief = renderBrief(state, decisions, completed, verification);
  while (Buffer.byteLength(brief, "utf8") > maxBytes) {
    if (decisions.length > 0) decisions = decisions.slice(1);
    else if (completed.length > 0) completed = completed.slice(1);
    else if (verification.length > 0) verification = verification.slice(1);
    else return Buffer.from(brief, "utf8").subarray(0, maxBytes).toString("utf8");
    brief = renderBrief(state, decisions, completed, verification);
  }
  return brief;
}
