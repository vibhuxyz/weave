import type { ChatTurn, TurnSegment } from "@/features/chat/hooks";

export function segmentsOf(turn: Pick<ChatTurn, "segments" | "text" | "tools">): readonly TurnSegment[] {
  if (turn.segments && turn.segments.length > 0) return turn.segments;
  const tools: TurnSegment[] = turn.tools.length > 0 ? [{ id: "tools", kind: "tools", toolIds: turn.tools.map((tool) => tool.id) }] : [];
  const text: TurnSegment[] = turn.text ? [{ id: "text", kind: "text", text: turn.text }] : [];
  return [...tools, ...text];
}
