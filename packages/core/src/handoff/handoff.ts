import type { Decision, TaskState, VerificationResult } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import type { EngineDescriptor } from "@weave/agent";
import type { Checkpoint } from "../checkpoint/index.ts";

const MAX_BRIEF_BYTES = 4096;

function section(heading: string, body: string): string {
  return `${heading}\n${body}`;
}

function renderWorkspace(state: TaskState): string {
  const { git, files } = state;
  const changedCount = files.modified.length + files.created.length + files.deleted.length;
  const branch = git.branch ?? "(unknown branch)";
  const base = git.baseCommit ? git.baseCommit.slice(0, 8) : "(unknown base)";
  const dirtyNote = git.dirty.length > 0 ? ", uncommitted" : "";
  return [
    `${branch} · base ${base} · ${changedCount} file(s) changed${dirtyNote}`,
    "The previous worker's changes are already on disk. Do not recreate them.",
  ].join("\n");
}

function renderChanged(files: TaskState["files"]): string {
  const paths = [...new Set([...files.modified, ...files.created, ...files.deleted])];
  if (paths.length === 0) return "  (no files changed)";
  return paths.map((p) => `  ${p}`).join("\n");
}

function renderVerified(entries: VerificationResult[]): string {
  if (entries.length === 0) return "  (nothing verified yet)";
  return entries
    .map((v) => `  ${v.rung.padEnd(11)} ${v.status.padEnd(6)} rung ${rungStrength(v.rung)}`)
    .join("\n");
}

function renderUnfinished(inFlight: TaskState["inFlight"]): string | null {
  if (inFlight.length === 0) return null;
  const body = inFlight
    .map(
      (t) =>
        `  ${t.locations[0] ?? t.title}   an edit was in progress when the previous worker stopped. Read it before editing.`,
    )
    .join("\n");
  return section("UNFINISHED — verify before trusting", body);
}

function renderClaimed(decisions: Decision[]): string | null {
  if (decisions.length === 0) return null;
  const body = decisions.map((d) => `  "${d.description}"`).join("\n");
  return section("CLAIMED BY THE PREVIOUS WORKER  (unverified — treat as hints)", body);
}

function renderBrief(
  state: TaskState,
  decisions: Decision[],
  completed: string[],
  verification: VerificationResult[],
): string {
  const parts = [
    section("TASK", state.goal),
    section("WORKSPACE", renderWorkspace(state)),
    section("CHANGED", renderChanged(state.files)),
    section("VERIFIED  (deterministic — these actually ran)", renderVerified(verification)),
  ];
  const unfinished = renderUnfinished(state.inFlight);
  if (unfinished) parts.push(unfinished);
  const claimed = renderClaimed(decisions);
  if (claimed) parts.push(claimed);
  if (state.inProgress || completed.length > 0) {
    parts.push(
      section(
        "WAS DOING",
        state.inProgress?.description ?? `(last completed: ${completed.at(-1) ?? "nothing yet"})`,
      ),
    );
  }
  parts.push(
    section(
      "FIRST INSTRUCTION",
      "Read the changed files before editing them. The filesystem is authoritative; " +
        "everything under CLAIMED is a hint from a worker that was interrupted.",
    ),
  );
  return parts.join("\n\n");
}

export function buildBrief(checkpoint: Checkpoint, _next: EngineDescriptor): string {
  const state = checkpoint.state;

  let decisions = state.decisions;
  let completed = state.completed;
  let verification = state.verification;

  let brief = renderBrief(state, decisions, completed, verification);
  while (Buffer.byteLength(brief, "utf8") > MAX_BRIEF_BYTES) {
    if (decisions.length > 0) {
      decisions = decisions.slice(1);
    } else if (completed.length > 0) {
      completed = completed.slice(1);
    } else if (verification.length > 0) {
      verification = verification.slice(1);
    } else {
      break;
    }
    brief = renderBrief(state, decisions, completed, verification);
  }

  return brief;
}
