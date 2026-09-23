import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui";
import { PERCENT_SCALE, contextUsageRatio, formatExactTokenCount, isAutoCompactOff, thresholdToPercent } from "../lib";
import type { ContextUsage } from "../lib";
import { useAutoCompactThreshold } from "../preferences";
import { ContextRing } from "./ContextRing";
import { ContextUsagePanel } from "./ContextUsagePanel";

interface ContextUsageButtonProps {
  readonly usage: ContextUsage | null;
  readonly engineLabel: string;
  readonly reportsContextUsage: boolean;
  readonly isCompactSupported: boolean;
  readonly canCompact: boolean;
  readonly isCompacting: boolean;
  readonly onCompact: () => void;
}

function autoCompactHint(threshold: number): string {
  const percent = thresholdToPercent(threshold);
  return isAutoCompactOff(percent) ? "Auto-compact off" : `Auto-compacts above ${percent}%`;
}

function tokensLabel(usage: ContextUsage): string {
  return `${formatExactTokenCount(usage.contextTokens)} / ${formatExactTokenCount(usage.contextLimit)} tokens`;
}

export function ContextUsageButton({
  usage,
  engineLabel,
  reportsContextUsage,
  isCompactSupported,
  canCompact,
  isCompacting,
  onCompact,
}: ContextUsageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const autoCompactThreshold = useAutoCompactThreshold();

  const ratio = contextUsageRatio(usage);
  const percent = Math.round(ratio * PERCENT_SCALE);
  const emptyMessage = reportsContextUsage
    ? "Usage appears after the first reply."
    : `${engineLabel} doesn't report context usage.`;
  const tooltip = usage ? tokensLabel(usage) : emptyMessage;

  const handleCompact = () => {
    setIsOpen(false);
    onCompact();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full bg-transparent hover:bg-transparent data-[state=open]:bg-transparent"
              aria-label={usage ? `Context window ${percent}% used: ${tooltip}` : `Context window: ${tooltip}`}
            >
              <ContextRing ratio={ratio} isOverThreshold={ratio > autoCompactThreshold} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="tabular-nums">{tooltip}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="center" sideOffset={10} className="w-72 rounded-2xl p-4">
        <ContextUsagePanel
          usage={usage}
          percent={percent}
          emptyMessage={emptyMessage}
          compaction={
            isCompactSupported
              ? { hint: autoCompactHint(autoCompactThreshold), canCompact, isCompacting, onCompact: handleCompact }
              : null
          }
        />
      </PopoverContent>
    </Popover>
  );
}
