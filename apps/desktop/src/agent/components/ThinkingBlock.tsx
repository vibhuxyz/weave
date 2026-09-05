import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronRight } from "lucide-react";
import { BerdLoaderInline } from "@/shared/ui/berd-loader-inline";
import { Shimmer } from "@/shared/ui/ai-elements/shimmer";
import { cn } from "@/shared/lib/cn";

/**
 * The agent's live activity line. Gemini's thought stream is a sequence of
 * `**Bold Title**` sections — we surface those titles as a progress list (the
 * last one is what it's doing now) instead of dumping the raw reasoning.
 *
 * While streaming we also show how long the turn has been running and, if the
 * stream goes quiet, how long since the last update — so a wedged engine reads
 * as "no update for 2m" instead of a silent, indistinguishable "Thinking…".
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
  const current = steps.at(-1) ?? lastLine(text);

  const { elapsed, sinceChange } = useActivityClock(text, streaming);
  const stale = streaming && sinceChange >= 20;

  const label = current ?? (streaming ? "Thinking…" : "Thought for a moment");

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
        {streaming && elapsed >= 1 && (
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tabular-nums",
              stale ? "text-agent-warn" : "text-agent-text-faint",
            )}
          >
            {stale
              ? `no update for ${formatDuration(sinceChange)}`
              : formatDuration(elapsed)}
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

/**
 * Seconds since the turn started, and seconds since `text` last changed.
 * Ticks once a second while `streaming`; frozen once the turn ends.
 */
function useActivityClock(text: string, streaming: boolean) {
  const startedAt = useRef(Date.now());
  const lastChangeAt = useRef(Date.now());
  const prevText = useRef(text);
  const [now, setNow] = useState(Date.now());

  if (text !== prevText.current) {
    prevText.current = text;
    lastChangeAt.current = Date.now();
  }

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [streaming]);

  const ref = streaming ? now : lastChangeAt.current;
  return {
    elapsed: Math.floor((ref - startedAt.current) / 1000),
    sinceChange: Math.floor((now - lastChangeAt.current) / 1000),
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
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

/** Last non-empty line, markdown emphasis stripped — a fallback activity line. */
function lastLine(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/[*_`#>]/g, "").trim())
    .filter(Boolean);
  return lines.at(-1);
}
