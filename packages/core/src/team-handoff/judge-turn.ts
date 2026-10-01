import { readTeamHandoff } from "./parse-handoff.ts";
import type { HandoffVerdict, TurnActivity } from "./types.ts";

export function judgeHandoff(activity: TurnActivity): HandoffVerdict {
  const reading = readTeamHandoff(activity.text);
  if (reading.kind !== "handoff") return reading;
  return { kind: "team", handoff: reading.handoff, uncommitted: [...activity.uncommitted].sort() };
}
