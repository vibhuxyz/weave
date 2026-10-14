import type { ServerMessage } from "../../../../../server/index.ts";
import type { ChatTurn } from "../acpChat/types";

type EngineHandoffMessage = Extract<ServerMessage, { readonly type: "engine-handoff" }>;

export function handoffTurn(message: EngineHandoffMessage, id: string, createdAt: number): ChatTurn {
  return {
    id,
    role: "notice",
    text: "",
    thought: "",
    tools: [],
    createdAt,
    handoff: {
      toEngineLabel: message.toEngineLabel,
      isResumed: message.isResumed,
      turnsHandedOff: message.turnsHandedOff,
      bytes: message.bytes,
    },
  };
}

export function hasEngineHandoff(turns: readonly ChatTurn[]): boolean {
  return turns.some((turn) => turn.handoff !== undefined);
}
