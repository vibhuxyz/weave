import type { Decision, Failure, RecentMessage, TaskState, VerificationResult } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import type { EngineDescriptor } from "@weave/agent";
import type { Checkpoint } from "../checkpoint/index.ts";
import { capBytes } from "../shared/index.ts";

const MAX_BRIEF_BYTES = 4096;
const MAX_GOAL_BYTES = 800;
const MAX_LISTED = 8;
const MAX_LINE_CHARS = 300;

interface ShownParts {
  readonly decisions: readonly Decision[];
  readonly completed: readonly string[];
  readonly verification: readonly VerificationResult[];
  readonly failures: readonly Failure[];
  readonly recent: readonly RecentMessage[];
}

function section(heading: string, body: string): string {
  return `${heading}\n${body}`;
}

function clipLine(line: string): string {
  const characters = [...line.replace(/\s+/g, " ").trim()];
  return characters.length <= MAX_LINE_CHARS ? characters.join("") : `${characters.slice(0, MAX_LINE_CHARS - 1).join("")}…`;
}

function listed(lines: readonly string[]): string {
  return lines.slice(-MAX_LISTED).map((line) => `  ${clipLine(line)}`).join("\n");
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

function renderRecent(recent: readonly RecentMessage[]): readonly string[] {
  if (recent.length === 0) return [];
  return [section("LAST WORDS  (the previous worker's own notes before it stopped — unverified)", recent.map((message) => `  ${message.text}`).join("\n"))];
}

function renderBrief(state: TaskState, shown: ShownParts): string {
  const { decisions, completed, verification, failures, recent } = shown;
  const unfinished = state.inFlight.map((tool) => `${tool.locations[0] ?? tool.title}   an edit was in progress when the previous worker stopped. Read it before editing.`);
  const doing = state.currentStep ?? `(last completed: ${completed.at(-1) ?? "nothing yet"})`;
  return [
    section("TASK", capBytes(state.goal, MAX_GOAL_BYTES)),
    section("WORKSPACE", renderWorkspace(state)),
    section("CHANGED", renderChanged(state.changedFiles)),
    ...renderRecent(recent),
    section("VERIFIED  (deterministic — these actually ran)", renderVerified(verification)),
    ...optional("FAILURES  (recorded by Weave)", failures.slice(-MAX_LISTED).map((failure) => `${failure.kind}: ${failure.message}`)),
    ...optional("UNFINISHED — verify before trusting", unfinished),
    ...optional("CLAIMED BY THE PREVIOUS WORKER  (unverified — treat as hints)", decisions.map((decision) => `"${decision.description}"`)),
    ...optional("DISCOVERIES", state.discoveries.map((discovery) => `${discovery.source === "worker" ? "(claimed) " : ""}${discovery.text}`)),
    ...optional("OPEN QUESTIONS", state.openQuestions.map((question) => question.text)),
    ...(state.currentStep || completed.length > 0 ? [section("WAS DOING", doing)] : []),
    ...(state.nextStep ? [section("NEXT STEP", state.nextStep)] : []),
    section("FIRST INSTRUCTION", "Read the changed files before editing them. The filesystem is authoritative; everything under CLAIMED is a hint from a worker that was interrupted."),
  ].join("\n\n");
}

export function buildBrief(checkpoint: Checkpoint, next: EngineDescriptor): string {
  return briefOf(checkpoint.state, MAX_BRIEF_BYTES, next.id);
}

function shrunk(shown: ShownParts): ShownParts | null {
  if (shown.decisions.length > 0) return { ...shown, decisions: shown.decisions.slice(1) };
  if (shown.completed.length > 0) return { ...shown, completed: shown.completed.slice(1) };
  if (shown.verification.length > 0) return { ...shown, verification: shown.verification.slice(1) };
  if (shown.failures.length > 0) return { ...shown, failures: shown.failures.slice(-MAX_LISTED).slice(1) };
  if (shown.recent.length > 0) return { ...shown, recent: shown.recent.slice(1) };
  return null;
}

export function briefOf(state: TaskState, maxBytes: number, nextEngineId: string | null): string {
  let shown: ShownParts | null = {
    decisions: state.decisions,
    completed: state.completed,
    verification: state.verification,
    failures: state.failures,
    recent: state.recentMessages.filter((message) => message.engineId !== null && message.engineId === nextEngineId),
  };
  let brief = renderBrief(state, shown);
  while (Buffer.byteLength(brief, "utf8") > maxBytes) {
    shown = shrunk(shown);
    if (shown === null) return Buffer.from(brief, "utf8").subarray(0, maxBytes).toString("utf8");
    brief = renderBrief(state, shown);
  }
  return brief;
}
