import type { DiffLine } from "@/agent/diff";

export interface SideTexts {
  readonly oldText: string;
  readonly newText: string;
  readonly oldIndex: readonly number[];
  readonly newIndex: readonly number[];
}

const NOT_ON_SIDE = -1;

export function sideTexts(lines: readonly DiffLine[]): SideTexts {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const oldIndex: number[] = [];
  const newIndex: number[] = [];
  for (const line of lines) {
    if (line.kind === "add") {
      oldIndex.push(NOT_ON_SIDE);
      newIndex.push(newLines.length);
      newLines.push(line.text);
      continue;
    }
    if (line.kind === "del") {
      oldIndex.push(oldLines.length);
      newIndex.push(NOT_ON_SIDE);
      oldLines.push(line.text);
      continue;
    }
    oldIndex.push(oldLines.length);
    newIndex.push(newLines.length);
    oldLines.push(line.text);
    newLines.push(line.text);
  }
  return { oldText: oldLines.join("\n"), newText: newLines.join("\n"), oldIndex, newIndex };
}
