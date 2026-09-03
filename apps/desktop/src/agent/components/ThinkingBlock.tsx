import { useState } from "react";
import { CheckIcon, ChevronRight } from "lucide-react";
import { BerdLoaderInline } from "@/shared/ui/berd-loader-inline";
import { Shimmer } from "@/shared/ui/ai-elements/shimmer";
import { cn } from "@/shared/lib/cn";

/**
 * The agent's live activity line. Gemini's thought stream is a sequence of
 * `**Bold Title**` sections — we surface those titles as a progress list (the
 * last one is what it's doing now) instead of dumping the raw reasoning.
 */
export function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasText = text.trim().length > 0;
  const steps = extractSteps(text);
  const current = steps.at(-1);

  const label =
    current ?? (streaming ? "Thinking…" : "Thought for a moment");

  return (
    <div className="dark w-full rounded-xl border border-agent-border bg-agent-surface-base text-agent-text">
      <button
        type="button"
        disabled={!hasText}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left text-sm",
          hasText && "hover:text-agent-text-bright",
        )}
      >
        <BerdLoaderInline size={18} animated={streaming} decorative />
        {streaming ? (
          <Shimmer className="min-w-0 flex-1 truncate text-sm">{label}</Shimmer>
        ) : (
          <span className="min-w-0 flex-1 truncate text-agent-text-faint">
            {label}
          </span>
        )}
        {steps.length > 1 && (
          <span className="shrink-0 font-mono text-[10px] text-agent-text-faint">
            {steps.length}
          </span>
        )}
        {hasText && (
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-agent-text-faint transition-transform",
              open && "rotate-90",
            )}
          />
        )}
      </button>

      {open && hasText && (
        <div className="border-agent-border border-t px-4 py-3">
          {steps.length > 0 ? (
            <ol className="space-y-1.5">
              {steps.map((step, i) => {
                const done = i < steps.length - 1 || !streaming;
                return (
                  <li
                    key={`${i}-${step}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    {done ? (
                      <CheckIcon className="mt-0.5 size-3 shrink-0 text-agent-success" />
                    ) : (
                      <span className="mt-1 size-1.5 shrink-0 animate-pulse rounded-full bg-agent-accent" />
                    )}
                    <span
                      className={cn(
                        done ? "text-agent-text-muted" : "text-agent-text-strong",
                      )}
                    >
                      {step}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-agent-text-muted text-xs leading-relaxed">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Pull the `**Bold Title**` section headers out of a thought stream. */
function extractSteps(text: string): string[] {
  const steps: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*\*\*(.+?)\*\*\s*:?\s*$/.exec(line);
    if (m) {
      const title = m[1].trim();
      if (title && steps.at(-1) !== title) steps.push(title);
    }
  }
  return steps;
}
