import { toolDiffLines, type DiffLineKind } from "@/agent/diff";
import type { ToolDiff } from "@/features/chat/hooks";
import { cn } from "@/shared/lib";
import { CODE_BLOCK_CLASS, MAX_PREVIEW_LINES } from "./constants";
import { CopyCodeButton } from "./CopyCodeButton";

const LINE_CLASS = {
  context: "text-agent-text-muted",
  add: "text-agent-medium-fg/80",
  del: "bg-agent-critical/10 text-agent-critical-fg line-through decoration-agent-critical/40",
} as const satisfies Record<DiffLineKind, string>;

const EDITED_ADD_CLASS = "bg-agent-success/10 text-agent-success";

export function DiffPreview({ diff }: { readonly diff: ToolDiff }) {
  const { lines, truncated } = toolDiffLines(diff);
  const isCreated = diff.oldText === null;
  const shown = lines.slice(0, MAX_PREVIEW_LINES);
  const hiddenCount = lines.length - shown.length;
  return (
    <div className="relative">
      <pre className={cn(CODE_BLOCK_CLASS, "max-h-96")}>
        {shown.map((line, index) => (
          <div
            key={`${index}:${line.oldLine ?? ""}:${line.newLine ?? ""}`}
            className={line.kind === "add" && !isCreated ? EDITED_ADD_CLASS : LINE_CLASS[line.kind]}
          >
            {line.text || " "}
          </div>
        ))}
        {(hiddenCount > 0 || truncated) && (
          <div className="text-agent-text-faint">{hiddenCount > 0 ? `… (+${hiddenCount} more lines)` : "… (diff truncated)"}</div>
        )}
      </pre>
      <CopyCodeButton text={diff.newText} label="Copy file contents" />
    </div>
  );
}
