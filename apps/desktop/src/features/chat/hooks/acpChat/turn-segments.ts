import type { TurnSegment } from "./types";

export function appendTextSegment(segments: readonly TurnSegment[] | undefined, chunk: string): TurnSegment[] {
  const current = segments ?? [];
  const last = current.at(-1);
  if (last?.kind === "text") return [...current.slice(0, -1), { ...last, text: last.text + chunk }];
  return [...current, { id: `s${current.length}`, kind: "text", text: chunk }];
}

export function appendToolSegment(segments: readonly TurnSegment[] | undefined, toolId: string): TurnSegment[] {
  const current = segments ?? [];
  const last = current.at(-1);
  if (last?.kind === "tools") return [...current.slice(0, -1), { ...last, toolIds: [...last.toolIds, toolId] }];
  return [...current, { id: `s${current.length}`, kind: "tools", toolIds: [toolId] }];
}
