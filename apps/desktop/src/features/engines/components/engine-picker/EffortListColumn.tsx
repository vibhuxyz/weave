import { CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { EFFORT_SKELETON_WIDTHS, REASONING_EFFORTS, type DisplayEffort } from "./constants";
import { ColumnSkeleton } from "./ColumnSkeleton";

interface EffortListColumnProps {
  selectedEffortValue: string;
  isLoading: boolean;
  onSelectEffort: (value: string) => void;
}

export function EffortListColumn({
  selectedEffortValue,
  isLoading,
  onSelectEffort,
}: EffortListColumnProps) {
  return (
    <div className="flex w-[160px] flex-col">
      <div className="px-2 pb-2 pt-1 text-sm font-semibold text-white">
        Reasoning effort
      </div>
      {isLoading ? (
        <ColumnSkeleton rowWidths={EFFORT_SKELETON_WIDTHS} label="Loading reasoning effort" />
      ) : (
        <div className="flex flex-col gap-0.5 animate-in fade-in duration-200">
          {REASONING_EFFORTS.map((effort: DisplayEffort) => {
            const isSelected =
              effort.value.toLowerCase() === selectedEffortValue.toLowerCase() ||
              effort.label.toLowerCase() === selectedEffortValue.toLowerCase();

            return (
              <button
                key={effort.value}
                type="button"
                onClick={() => onSelectEffort(effort.value)}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-white/15 text-white font-medium"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <span>{effort.label}</span>
                {isSelected && (
                  <CheckIcon className="size-3.5 text-zinc-300 shrink-0 ml-1" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
