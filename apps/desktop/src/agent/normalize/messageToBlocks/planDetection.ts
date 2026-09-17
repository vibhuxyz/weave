import type { ToolEntry } from "@/features/chat/hooks";
import type { BlockSource, PlanBlock, PlanBlockEntry } from "../types";

export function planFromText(
  text: string,
  turnId: string,
  source: BlockSource,
): PlanBlock | null {
  const planTagMatch = /<plan>([\s\S]*?)<\/plan>/i.exec(text);
  if (planTagMatch) {
    const rawLines = (planTagMatch[1] ?? "").split("\n");
    const entries: PlanBlockEntry[] = [];
    for (const line of rawLines) {
      const match = /^\s*(?:\d+[.)]|-|\*)\s+(.+)$/.exec(line);
      const content = match?.[1]?.trim();
      if (content) {
        entries.push({
          id: `step-${entries.length + 1}`,
          content,
          priority: "medium",
          status: "pending",
        });
      }
    }
    if (entries.length > 0) {
      return {
        id: `plan-${turnId}`,
        schemaVersion: 1,
        source,
        type: "plan",
        title: "Execution Plan",
        entries,
        turnId,
      };
    }
  }

  const headingMatch =
    /(?:^|\n)##+ (?:Execution Plan|Implementation Plan|Proposed Plan|Plan)\b([\s\S]*?)(?=\n##+ |\n\n\n|$)/i.exec(
      text,
    );
  if (headingMatch) {
    const rawLines = (headingMatch[1] ?? "").split("\n");
    const entries: PlanBlockEntry[] = [];
    for (const line of rawLines) {
      const match = /^\s*(?:\d+[.)]|-|\*)\s+(.+)$/.exec(line);
      const captured = match?.[1];
      const content = captured?.trim();
      if (captured && content && !captured.startsWith("#")) {
        entries.push({
          id: `step-${entries.length + 1}`,
          content,
          priority: "medium",
          status: "pending",
        });
      }
    }
    if (entries.length >= 2) {
      return {
        id: `plan-${turnId}`,
        schemaVersion: 1,
        source,
        type: "plan",
        title: "Execution Plan",
        entries,
        turnId,
      };
    }
  }

  return null;
}

/** Loose "numbered or bulleted list" parser — only trusted once we already
 *  know the agent is in plan mode (an ExitPlanMode tool call this turn). */
export function planStepsFromText(text: string): PlanBlockEntry[] {
  const entries: PlanBlockEntry[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(?:\d+[.)]|[-*])\s+(.+)$/.exec(line);
    const content = match?.[1]?.replace(/^\*\*|\*\*$/g, "").trim();
    if (content && !content.startsWith("#")) {
      entries.push({
        id: `step-${entries.length + 1}`,
        content,
        priority: "medium",
        status: "pending",
      });
    }
  }
  return entries;
}

function isPlanModeTool(t: ToolEntry): boolean {
  const title = t.title.toLowerCase();
  return (
    /\bexit\s?plan\s?mode\b|\bpresent(?:ed|ing)? (?:the )?plan\b|\bapprove plan\b/.test(
      title,
    ) || /\.claude\/plans\/[^\s]*\.md\b/.test(title)
  );
}

/** Claude Code plan mode ends with an `ExitPlanMode` tool call; some engines
 *  title it "Approve Plan" / "Present plan". Also treat a write into
 *  `~/.claude/plans/*.md` as the same signal. */
export function isPlanModeExit(tools: ToolEntry[]): boolean {
  return tools.some(isPlanModeTool);
}

/** The full plan markdown — from the `ExitPlanMode` tool's `{ plan }` arg, or
 *  the `{ content }` of the write into `~/.claude/plans/*.md`. Far richer than
 *  the prose summary the agent leaves in the chat message. */
export function planTextFromTools(tools: ToolEntry[]): string | null {
  for (const t of tools) {
    if (!isPlanModeTool(t)) continue;
    const raw = t.rawInput;
    if (typeof raw === "string" && raw.trim()) return raw;
    if (raw && typeof raw === "object") {
      const rec = raw as Record<string, unknown>;
      for (const key of ["plan", "content", "text", "markdown"]) {
        if (typeof rec[key] === "string" && (rec[key] as string).trim()) {
          return rec[key] as string;
        }
      }
    }
    if (t.output && t.output.trim().length > 40) return t.output;
  }
  return null;
}
