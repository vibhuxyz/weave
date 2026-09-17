import type { TranscriptKeepAlivePriority } from "@/features/chat/transcript/projection";
import {
  assertNever,
  type Candidate,
  type CandidateSelection,
  type TranscriptKeepAlivePolicyOptions,
  type TranscriptRowProtectionReason,
  TRANSCRIPT_KEEP_ALIVE_PRIORITY_WEIGHT,
} from "./types";

export function priorityForReason(
  reason: TranscriptRowProtectionReason,
): TranscriptKeepAlivePriority {
  switch (reason) {
    case "focused":
      return "focused";
    case "selection":
      return "selection";
    case "open-overlay":
      return "open-ui";
    case "active-mcp":
      return "active-mcp";
    case "active-stream":
      return "active-stream";
    case "recent":
      return "recent";
    default:
      return assertNever(reason);
  }
}

export function reasonForPriority(
  priority: TranscriptKeepAlivePriority,
): TranscriptRowProtectionReason {
  switch (priority) {
    case "focused":
      return "focused";
    case "selection":
      return "selection";
    case "open-ui":
      return "open-overlay";
    case "active-mcp":
      return "active-mcp";
    case "active-stream":
      return "active-stream";
    case "recent":
    case "none":
      return "recent";
    default:
      return assertNever(priority);
  }
}

export function upsertCandidate(
  candidates: Map<string, Candidate>,
  input: {
    rowId: string;
    priority: TranscriptKeepAlivePriority;
    reason: TranscriptRowProtectionReason;
    activatedAtMs: number;
    updatedAtMs: number;
    expiresAtMs?: number;
  },
): void {
  const existing = candidates.get(input.rowId);
  if (!existing) {
    candidates.set(input.rowId, {
      rowId: input.rowId,
      priorities: new Set([input.priority]),
      reasons: new Set([input.reason]),
      activatedAtMs: input.activatedAtMs,
      updatedAtMs: input.updatedAtMs,
      expiresAtMs: input.expiresAtMs,
    });
    return;
  }

  existing.priorities.add(input.priority);
  existing.reasons.add(input.reason);
  existing.activatedAtMs = Math.min(
    existing.activatedAtMs,
    input.activatedAtMs,
  );
  existing.updatedAtMs = Math.max(existing.updatedAtMs, input.updatedAtMs);
  existing.expiresAtMs = minDefined(existing.expiresAtMs, input.expiresAtMs);
}

export function selectCandidates(
  candidates: readonly Candidate[],
  policy: TranscriptKeepAlivePolicyOptions,
): CandidateSelection {
  const interactionCandidates = candidates
    .filter(hasInteractionPriority)
    .sort(compareCandidatePriority);
  const interactionRowIds = new Set(
    interactionCandidates.map((candidate) => candidate.rowId),
  );
  const activeStreamCandidates = candidates
    .filter(
      (candidate) =>
        !interactionRowIds.has(candidate.rowId) &&
        candidate.priorities.has("active-stream"),
    )
    .sort(compareCandidatePriority);
  const protectedActiveStream = activeStreamCandidates.slice(
    0,
    policy.activeStreamRowsPerSessionCap,
  );
  const activeStreamOverflow = activeStreamCandidates.slice(
    policy.activeStreamRowsPerSessionCap,
  );
  const forced = [...interactionCandidates, ...protectedActiveStream];
  // Exclude only selected forced rows from the MCP/recent categories. Stream
  // overflow can still be protected by an active MCP signal; otherwise a stale
  // stream bit could evict live embedded app state.
  const forcedRowIds = new Set(
    [...interactionCandidates, ...protectedActiveStream].map(
      (candidate) => candidate.rowId,
    ),
  );
  const mcpCandidates = candidates
    .filter(
      (candidate) =>
        !forcedRowIds.has(candidate.rowId) &&
        candidate.priorities.has("active-mcp"),
    )
    .sort(compareCandidatePriority);
  const mcp = mcpCandidates.slice(0, policy.mcpRowsPerSessionCap);
  const evictedMcp = mcpCandidates.slice(policy.mcpRowsPerSessionCap);
  const selectedMcpRowIds = new Set(mcp.map((candidate) => candidate.rowId));
  const evictedActiveStream = activeStreamOverflow.filter(
    (candidate) => !selectedMcpRowIds.has(candidate.rowId),
  );
  const activeStreamRowIds = new Set(
    activeStreamCandidates.map((candidate) => candidate.rowId),
  );
  const recentCandidates = candidates
    .filter(
      (candidate) =>
        !forcedRowIds.has(candidate.rowId) &&
        !activeStreamRowIds.has(candidate.rowId) &&
        !selectedMcpRowIds.has(candidate.rowId) &&
        !candidate.priorities.has("active-mcp") &&
        candidate.priorities.has("recent"),
    )
    .sort(compareCandidatePriority);
  const recent = recentCandidates.slice(0, policy.recentRowsPerSessionCap);
  const evictedRecent = recentCandidates.slice(policy.recentRowsPerSessionCap);

  return {
    forced,
    mcp,
    recent,
    evictedActiveStream,
    evictedMcp,
    evictedRecent,
  };
}

export function hasInteractionPriority(candidate: Candidate): boolean {
  return (
    candidate.priorities.has("focused") ||
    candidate.priorities.has("selection") ||
    candidate.priorities.has("open-ui")
  );
}

export function compareCandidatePriority(
  left: Candidate,
  right: Candidate,
): number {
  const priorityDelta =
    highestPriorityWeight(right) - highestPriorityWeight(left);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const updatedDelta = right.updatedAtMs - left.updatedAtMs;
  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  return left.rowId.localeCompare(right.rowId);
}

export function highestPriorityWeight(candidate: Candidate): number {
  let weight = 0;
  for (const priority of candidate.priorities) {
    weight = Math.max(weight, TRANSCRIPT_KEEP_ALIVE_PRIORITY_WEIGHT[priority]);
  }
  return weight;
}

export function uniqueSortedRowIds(
  candidates: readonly Candidate[],
): readonly string[] {
  return [...new Set(candidates.map((candidate) => candidate.rowId))].sort();
}

export function comparePriority(
  left: TranscriptKeepAlivePriority,
  right: TranscriptKeepAlivePriority,
): number {
  const delta =
    TRANSCRIPT_KEEP_ALIVE_PRIORITY_WEIGHT[right] -
    TRANSCRIPT_KEEP_ALIVE_PRIORITY_WEIGHT[left];
  if (delta !== 0) {
    return delta;
  }
  return left.localeCompare(right);
}

function minDefined(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.min(left, right);
}
