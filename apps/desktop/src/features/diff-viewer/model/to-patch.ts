import type { FileDiff } from "@/agent/diff";

const MARKER: Readonly<Record<string, string>> = { add: "+", del: "-", context: " " };

export function toPatch(file: FileDiff): string {
  const out: string[] = [`--- a/${file.oldPath ?? file.path}`, `+++ b/${file.path}`];
  for (const hunk of file.hunks) {
    out.push(`@@ -${String(hunk.oldStart)} +${String(hunk.newStart)} @@`);
    for (const line of hunk.lines) out.push(`${MARKER[line.kind] ?? " "}${line.text}`);
  }
  return out.join("\n");
}
