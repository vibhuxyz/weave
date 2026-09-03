import { MessageResponse } from "@/shared/ui/ai-elements/message";
import { cn } from "@/shared/lib/cn";

/**
 * Renders agent prose as markdown, pinned to the dark card typography. Use this
 * anywhere a block shows model-written text — never a bare `<p>{content}</p>`,
 * or `**bold**` / `- lists` / `` `code` `` show up as literal syntax.
 */
export function Prose({
  children,
  size = "sm",
  className,
}: {
  children: string;
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <div
      className={cn(
        size === "xs" ? "text-xs leading-6" : "text-sm leading-7",
        "text-agent-text",
        "[&_p]:my-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_strong]:text-agent-text-bright [&_strong]:font-semibold",
        "[&_em]:text-agent-text-strong",
        "[&_h1]:text-agent-text-bright [&_h2]:text-agent-text-bright [&_h3]:text-agent-text-bright [&_h4]:text-agent-text-bright [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-6 [&_h2]:mt-5 [&_h3]:mt-4 [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-1.5",
        "[&_a]:text-agent-low-fg [&_a]:underline-offset-2",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:marker:text-agent-text-faint",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-agent-surface-hover [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] [&_:not(pre)>code]:text-agent-accent",
        "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-agent-code-border [&_pre]:bg-agent-code-bg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-6",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-agent-accent/50 [&_blockquote]:pl-3 [&_blockquote]:text-agent-info-fg",
        "[&_table]:my-4 [&_table]:w-full [&_table]:text-xs [&_th]:border-b [&_th]:border-agent-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-agent-text-muted [&_td]:border-b [&_td]:border-agent-border-subtle [&_td]:px-2 [&_td]:py-1.5",
        "[&_hr]:my-5 [&_hr]:border-agent-border",
        className,
      )}
    >
      <MessageResponse>{tidyProse(children)}</MessageResponse>
    </div>
  );
}

/**
 * Agents often collapse structure onto one line: `**Label:** text **Next:** …`
 * and `The math: - a - b - c`. Restore the line breaks markdown needs so those
 * render as bold leads and bullet lists instead of a wall of asterisks.
 */
export function tidyProse(text: string): string {
  const out: string[] = [];
  let inFence = false;

  for (const rawLine of text.split("\n")) {
    if (rawLine.trimStart().startsWith("```")) {
      inFence = !inFence;
      out.push(rawLine);
      continue;
    }
    if (inFence) {
      out.push(rawLine);
      continue;
    }

    let line = rawLine;

    // Break before an inline `**Label:**` lead that isn't already at line start.
    line = line.replace(/(\S)\s+(\*\*[^*\n]{1,40}?:\*\*)/g, "$1\n\n$2");

    // Inline "label:" bullet runs — "The math: - Lock: … - Unlock: …" — become a
    // real list. Deliberately narrow: the item must start with a Capitalized
    // word + colon, so arithmetic ("250000 - 125000") is never touched.
    if ((line.match(/\s-\s+[A-Z][a-z]+:/g) ?? []).length >= 2) {
      line = line.replace(/(\S):\s+-\s+(?=[A-Z][a-z]+:)/g, "$1:\n- ");
      line = line.replace(/\s+-\s+(?=[A-Z][a-z]+:)/g, "\n- ");
    }

    out.push(line);
  }

  return out.join("\n");
}
