import { CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { MODEL_SKELETON_WIDTHS, type DisplayModel } from "./constants";
import { ColumnSkeleton } from "./ColumnSkeleton";

interface ModelListColumnProps {
  models: readonly DisplayModel[];
  selectedModelValue: string;
  isLoading: boolean;
  onSelectModel: (value: string) => void;
}

export function ModelListColumn({
  models,
  selectedModelValue,
  isLoading,
  onSelectModel,
}: ModelListColumnProps) {
  return (
    <div className="flex min-w-[220px] flex-1 flex-col">
      <div className="px-2 pb-2 pt-1 text-sm font-semibold text-white">
        Model
      </div>
      {isLoading ? (
        <ColumnSkeleton rowWidths={MODEL_SKELETON_WIDTHS} label="Loading models" />
      ) : (
        <div className="flex flex-col gap-0.5 animate-in fade-in duration-200">
          {models.map((model) => {
            const isSelected = model.value === selectedModelValue;

            return (
              <button
                key={model.value}
                type="button"
                onClick={() => onSelectModel(model.value)}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-white/15 text-white font-medium"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <span className="truncate">{model.name}</span>
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
