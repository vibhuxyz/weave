import type { TurnSegment } from "@/features/chat/hooks";

export function appendText(segments: readonly TurnSegment[], chunk: string): TurnSegment[] {
  const last = segments.at(-1);
  if (last?.kind === "text") return [...segments.slice(0, -1), { ...last, text: last.text + chunk }];
  return [...segments, { id: `s${segments.length}`, kind: "text", text: chunk }];
}

export function appendThought(segments: readonly TurnSegment[], chunk: string): TurnSegment[] {
  const last = segments.at(-1);
  if (last?.kind === "thought") return [...segments.slice(0, -1), { ...last, text: last.text + chunk }];
  return [...segments, { id: `s${segments.length}`, kind: "thought", text: chunk }];
}

export function appendTool(segments: readonly TurnSegment[], toolId: string): TurnSegment[] {
  const last = segments.at(-1);
  if (last?.kind === "tools") return [...segments.slice(0, -1), { ...last, toolIds: [...last.toolIds, toolId] }];
  return [...segments, { id: `s${segments.length}`, kind: "tools", toolIds: [toolId] }];
}
