import type { ToolEntry } from "@/features/chat/hooks";

// Commands that change state. Deliberately requires a mutating *subcommand* —
// `npm --version` / `git status` / `node -v` must not count.
const MUTATING_COMMAND =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci|run|exec|create|init|link|uninstall|remove)\b|\bgit\s+(?:commit|add|checkout|switch|merge|rebase|reset|push|pull|stash|apply|clean|rm|mv|init|branch\s+-)\b|\b(?:mkdir|rmdir|rm|mv|cp|touch|ln|chmod|chown|tee|sed\s+-i)\b|>>?\s|\bdocker\s+(?:run|build|compose|rm|exec|start|stop)\b|\bcurl\b[^\n]*\s-X\s*(?:POST|PUT|PATCH|DELETE)|\b(?:migrate|prisma\s+(?:migrate|db|generate)|drizzle-kit)\b/i;

export function mutatesState(tools: ToolEntry[]): boolean {
  return tools.some(
    (t) =>
      t.kind === "edit" ||
      t.kind === "delete" ||
      t.kind === "move" ||
      (t.kind === "execute" && MUTATING_COMMAND.test(t.title)),
  );
}

export function sourceFromTurn(sourceEventIds?: string[], sourceSeq?: number) {
  const last = sourceEventIds?.at(-1);
  if (!last || sourceSeq === undefined) return undefined;
  const [runId] = last.split(":");
  return runId ? { runId, seq: sourceSeq } : undefined;
}

export function summarizeFindings(count: number, text: string): string {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 20 && !/^(#|[-*]|\d+\.|critical|high|medium|low|info)\b/i.test(line),
    );
  return (first ?? `${count} issues found in this pass.`).replace(/\*\*|__|`/g, "");
}
