import { readTeamHandoff } from "@weave/core/browser";
import { HANDING_OFF_TEXT, HANDOFF_BLOCK_IN_TEXT } from "../constants";

export function withReadableHandoff(text: string): string {
  return text.replace(HANDOFF_BLOCK_IN_TEXT, (block) => {
    const reading = readTeamHandoff(block);
    return reading.kind === "handoff" ? `**Starting a team on the rest:** ${reading.handoff.reason}` : HANDING_OFF_TEXT;
  });
}
