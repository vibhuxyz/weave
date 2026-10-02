import { useEffect, useState } from "react";
import type { BundledLanguage, ThemedToken } from "shiki";
import { highlightCode } from "@/shared/ui/ai-elements/code-block";
import { cn } from "@/shared/lib";

const EXT_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  html: "html",
  md: "markdown",
  py: "python",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sql: "sql",
  sh: "shell",
  bash: "shell"
};

export function CodeView({ content, filename }: { readonly content: string; readonly filename?: string }) {
  const lines = content.split('\n');

  const [tokenized, setTokenized] = useState<{ tokens: ThemedToken[][] } | null>(null);

  useEffect(() => {
    const ext = filename?.split(".").pop()?.toLowerCase();
    const lang = (ext ? EXT_LANG[ext] : undefined) ?? "text";
    const cached = highlightCode(content, lang as BundledLanguage, (res) => {
      setTokenized(res as { tokens: ThemedToken[][] });
    });
    if (cached) {
      setTokenized(cached as { tokens: ThemedToken[][] });
    }
  }, [content, filename]);

  // Shiki font styles bitwise constants
  // oxlint-disable-next-line eslint(no-bitwise)
  const isItalic = (fontStyle?: number) => fontStyle && (fontStyle & 1);
  // oxlint-disable-next-line eslint(no-bitwise)
  const isBold = (fontStyle?: number) => fontStyle && (fontStyle & 2);
  // oxlint-disable-next-line eslint(no-bitwise)
  const isUnderline = (fontStyle?: number) => fontStyle && (fontStyle & 4);

  return (
    <div className="min-w-0 font-mono text-[11px] leading-[1.6]">
      <table className="w-full border-collapse border-spacing-0">
        <tbody>
          {tokenized ? (
            tokenized.tokens.map((lineTokens, i) => (
              <tr key={i} className="hover:bg-agent-surface-hover/30">
                <td className="w-12 shrink-0 select-none border-agent-border/50 border-r bg-agent-surface-raised px-3 text-right text-agent-text-faint align-top sticky left-0 z-10">
                  {i + 1}
                </td>
                <td className="whitespace-pre px-4 text-agent-text">
                  {lineTokens.map((token, j) => (
                    <span
                      key={j}
                      style={{ color: token.color }}
                      className={cn(
                        isItalic(token.fontStyle) && "italic",
                        isBold(token.fontStyle) && "font-bold",
                        isUnderline(token.fontStyle) && "underline",
                      )}
                    >
                      {token.content}
                    </span>
                  ))}
                  {lineTokens.length === 0 && <span className="select-none">{"\n"}</span>}
                </td>
              </tr>
            ))
          ) : (
            lines.map((line, i) => (
              <tr key={i} className="hover:bg-agent-surface-hover/30">
                <td className="w-12 shrink-0 select-none border-agent-border/50 border-r bg-agent-surface-raised px-3 text-right text-agent-text-faint align-top sticky left-0 z-10">
                  {i + 1}
                </td>
                <td className="whitespace-pre px-4 text-agent-text">
                  {line || <span className="select-none">{"\n"}</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

