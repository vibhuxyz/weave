/**
 * The brief: what the next engine receives on a handoff. CONTINUATION.md §9,
 * §10 Slice 5. Not the transcript — a bounded, sectioned-by-trust string
 * rendered from a `Checkpoint`.
 *
 * Supersedes the desktop prototype's `buildHandoffContext` /
 * `HandoffContext` (`apps/desktop/src/agent/execution/handoff.ts`, deleted
 * with this slice — it built an intermediate object nothing ever rendered;
 * the brief IS the deliverable, so this goes straight to text).
 */

import type { CommandResult, TaskState, VerificationResult } from "@weave/protocol";
import { rungStrength } from "@weave/protocol";
import type { EngineDescriptor } from "@weave/agent";
import type { Checkpoint } from "./checkpoint.ts";

/** ~1000 tokens, per §9. */
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

function renderChanged(state: TaskState): string {
  const paths = [...new Set([...state.files.modified, ...state.files.created, ...state.files.deleted])];
  if (paths.length === 0) return "  (no files changed)";
  return paths.map((p) => `  ${p}`).join("\n");
}

function renderVerified(entries: VerificationResult[]): string {
  if (entries.length === 0) return "  (nothing verified yet)";
  return entries
    .map((v) => `  ${v.rung.padEnd(11)} ${v.status.padEnd(6)} rung ${rungStrength(v.rung)}`)
    .join("\n");
}

function renderUnfinished(state: TaskState): string | null {
  if (state.inFlight.length === 0) return null;
  const body = state.inFlight
    .map(
      (t) =>
        `  ${t.locations[0] ?? t.title}   an edit was in progress when the previous worker stopped. Read it before editing.`,
    )
    .join("\n");
  return section("UNFINISHED — verify before trusting", body);
}

function renderClaimed(state: TaskState): string | null {
  if (state.decisions.length === 0) return null;
  const body = state.decisions.map((d) => `  "${d.description}"`).join("\n");
  return section("CLAIMED BY THE PREVIOUS WORKER  (unverified — treat as hints)", body);
}

/**
 * Render `checkpoint` into the bounded brief a resumed task hands the next
 * engine. `next` is accepted per the CONTINUATION.md §6 contract — reserved
 * for engine-specific tailoring (context budget, capability caveats); V1.2
 * does not yet vary the output by it.
 */
export function buildBrief(checkpoint: Checkpoint, _next: EngineDescriptor): string {
  const state = checkpoint.state;

  // Priority order for trimming, mirrors the drop list in §9: claims first,
  // then older completed steps, then verification detail. Goal, CHANGED, and
  // UNFINISHED are never touched.
  let decisions = state.decisions;
  let completed = state.completed;
  let commands: CommandResult[] = state.commands;
  let verification = state.verification;

  const render = (): string => {
    const parts = [
      section("TASK", state.goal),
      section("WORKSPACE", renderWorkspace(state)),
      section("CHANGED", renderChanged(state)),
      section("VERIFIED  (deterministic — these actually ran)", renderVerified(verification)),
    ];
    const unfinished = renderUnfinished(state);
    if (unfinished) parts.push(unfinished);
    const claimed = decisions.length > 0 ? renderClaimed({ ...state, decisions }) : null;
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
  };

  let brief = render();
  // Trim in priority order until the brief fits, or there is nothing left to
  // trim — CHANGED and UNFINISHED are built straight from `state` and never
  // touched by this loop.
  while (Buffer.byteLength(brief, "utf8") > MAX_BRIEF_BYTES) {
    if (decisions.length > 0) {
      decisions = decisions.slice(1);
    } else if (completed.length > 0) {
      completed = completed.slice(1);
    } else if (verification.length > 0 || commands.length > 0) {
      verification = verification.slice(1);
      commands = commands.slice(1);
    } else {
      break; // Nothing left that this function is allowed to drop.
    }
    brief = render();
  }

  return brief;
}
