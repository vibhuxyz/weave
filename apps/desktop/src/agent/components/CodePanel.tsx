import { CheckIcon, CopyIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";

/**
 * The one code / terminal surface for the agent card. Header carries an
 * optional title, file ref, and a copy button; the body scrolls. `variant`
 * "diff" colours `+`/`-` lines.
 */
export function CodePanel({
  code,
  title,
  file,
  language,
  variant = "code",
  className,
  copyable = true,
  trailing,
}: {
  code: string;
  title?: string;
  file?: string;
  language?: string;
  variant?: "code" | "diff";
  className?: string;
  copyable?: boolean;
  trailing?: ReactNode;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const hasHeader = Boolean(title || file || copyable || trailing);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-agent-code-border bg-agent-code-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center gap-2 border-agent-code-border border-b bg-agent-code-header-bg px-3 py-1.5 text-xs">
          {title && <span className="font-mono text-agent-text-strong">{title}</span>}
          {file && (
            <span className="truncate font-mono text-agent-text-faint">{file}</span>
          )}
          {language && !title && !file && (
            <span className="font-mono text-agent-text-faint uppercase">{language}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {trailing}
            {copyable && (
              <button
                type="button"
                onClick={() => copyToClipboard(code)}
                className="flex items-center gap-1 text-agent-text-faint transition-colors hover:text-agent-text-bright"
              >
                {isCopied ? (
                  <CheckIcon className="size-3.5 text-agent-success" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-agent-text">
        {variant === "diff" ? (
          <code>
            {code.split("\n").map((line, i) => (
              <span
                key={i}
                className={cn(
                  "block",
                  line.startsWith("+") && !line.startsWith("+++") && "text-agent-success",
                  line.startsWith("-") && !line.startsWith("---") && "text-agent-critical-fg",
                  line.startsWith("@@") && "text-agent-low-fg",
                )}
              >
                {line || " "}
              </span>
            ))}
          </code>
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </section>
  );
}
