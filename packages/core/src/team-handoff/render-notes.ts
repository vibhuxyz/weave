import { escapeClosingTag } from "../shared/index.ts";
import { NOTES_TAG } from "./constants.ts";
import type { TeamHandoff } from "./types.ts";

function listSection(heading: string, items: readonly string[]): readonly string[] {
  return items.length === 0 ? [] : [heading, ...items.map((item) => `- ${item}`)];
}

export function renderHandoffNotes(handoff: TeamHandoff): string {
  const body = [
    `Why a team: ${handoff.reason}`,
    ...listSection("Done so far:", handoff.done),
    ...listSection("Still to do:", handoff.remaining),
    ...listSection("Found in the project:", handoff.findings),
  ].join("\n");
  return `<${NOTES_TAG} source="the chat agent that started this work; claims, not checked facts">\n${escapeClosingTag(body, NOTES_TAG)}\n</${NOTES_TAG}>`;
}
