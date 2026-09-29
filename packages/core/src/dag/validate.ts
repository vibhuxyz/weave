import { validateGraph } from "../planner/index.ts";
import { undeclaredOutputs } from "../planner/validate/index.ts";
import type { DagIssue, DagIssueKind, DagTask, DagValidation } from "./types.ts";

const STRUCTURE_KINDS: readonly (readonly [RegExp, DagIssueKind])[] = [
  [/^Duplicate task id/, "duplicate-task"],
  [/depends on itself$/, "self-dependency"],
  [/depends on unknown task/, "unknown-dependency"],
  [/^Dependency cycle:/, "cycle"],
];

function structureIssue(message: string): DagIssue {
  const matched = STRUCTURE_KINDS.find(([pattern]) => pattern.test(message));
  return { kind: matched?.[1] ?? "unknown-dependency", message };
}

export function validateDag(tasks: readonly DagTask[]): DagValidation {
  const structure = validateGraph(tasks).map(structureIssue);
  if (structure.length > 0) return { ok: false, issues: structure };

  const artifacts = undeclaredOutputs(tasks).map((message) => ({
    kind: "undeclared-output" as const,
    message,
  }));

  return artifacts.length > 0 ? { ok: false, issues: artifacts } : { ok: true };
}
