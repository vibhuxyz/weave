import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { CONTEXT_EXPAND_STEP } from "../../constants";

const BUTTON = "rounded p-0.5 text-diff-expander-fg transition-colors hover:bg-diff-expander-hover-bg hover:text-agent-text-bright";

export function ContextExpander({
  remaining,
  onExpandUp,
  onExpandDown,
}: {
  readonly remaining: number;
  readonly onExpandUp: () => void;
  readonly onExpandDown: () => void;
}) {
  if (remaining <= 0) return null;
  const wholeGap = remaining <= CONTEXT_EXPAND_STEP;
  return (
    <div className="flex items-center gap-2 bg-diff-expander-bg px-2 py-1 text-[11px] text-diff-expander-fg">
      {wholeGap ? (
        <button type="button" onClick={onExpandDown} aria-label={`Show ${String(remaining)} unmodified lines`} className={BUTTON}>
          <ChevronsUpDownIcon className="size-3.5" />
        </button>
      ) : (
        <span className="flex shrink-0 flex-col">
          <button type="button" onClick={onExpandDown} aria-label="Show lines below the gap" className={BUTTON}>
            <ChevronUpIcon className="size-3" />
          </button>
          <button type="button" onClick={onExpandUp} aria-label="Show lines above the gap" className={BUTTON}>
            <ChevronDownIcon className="size-3" />
          </button>
        </span>
      )}
      <span className="font-mono">
        {remaining} unmodified line{remaining === 1 ? "" : "s"}
      </span>
    </div>
  );
}
