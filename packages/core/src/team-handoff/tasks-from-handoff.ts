import type { PlannedTask } from "../planner/index.ts";
import { escapeClosingTag } from "../shared/index.ts";
import { NOTES_TAG } from "./constants.ts";
import type { HandoffItem, TeamHandoff } from "./types.ts";

const MAX_TITLE_CHARS = 80;

function titleOf(item: HandoffItem): string {
  return item.work.length <= MAX_TITLE_CHARS ? item.work : `${item.work.slice(0, MAX_TITLE_CHARS - 1)}…`;
}

function promptFor(item: HandoffItem): string {
  const scope = item.paths.length > 0 ? `\n\nChange only these folders: ${item.paths.join(", ")}.` : "";
  return `${item.work}${scope}`;
}

export function tasksFromHandoff(handoff: TeamHandoff, cwd: string): readonly PlannedTask[] {
  return handoff.remaining.map((item) => ({
    id: item.id,
    title: titleOf(item),
    prompt: promptFor(item),
    cwd,
    ...(item.paths.length > 0 ? { allowedPaths: [...item.paths] } : {}),
    ...(item.dependsOn.length > 0 ? { dependencies: item.dependsOn.map((task) => ({ task, requiredOutputs: [] })) } : {}),
  }));
}

export function briefingsFromHandoff(handoff: TeamHandoff): ReadonlyMap<string, string> {
  const lines = [
    `Why a team is on this: ${handoff.reason}`,
    ...(handoff.done.length > 0 ? ["Already finished by the chat agent:", ...handoff.done.map((entry) => `- ${entry}`)] : []),
    ...(handoff.findings.length > 0 ? ["Found in the project:", ...handoff.findings.map((entry) => `- ${entry}`)] : []),
  ];
  const brief = `<${NOTES_TAG} source="the chat agent that started this work; claims, not checked facts">\n${escapeClosingTag(lines.join("\n"), NOTES_TAG)}\n</${NOTES_TAG}>`;
  return new Map(handoff.remaining.map((item) => [item.id, brief]));
}
