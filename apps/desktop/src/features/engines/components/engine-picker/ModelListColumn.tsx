import { CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import type { DisplayModel } from "./constants";

interface ModelListColumnProps {
  models: readonly DisplayModel[];
  selectedModelValue: string;
  onSelectModel: (value: string) => void;
}

export function ModelListColumn({
  models,
  selectedModelValue,
  onSelectModel,
}: ModelListColumnProps) {
  return (
    <div className="flex w-[185px] flex-col border-r border-white/10 pr-2">
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-zinc-400">
        Model
      </div>
      <div className="flex flex-col gap-0.5">
        {models.length === 0 && (
          <div className="px-2 py-3 text-xs text-zinc-500">
            Fetching models...
          </div>
        )}
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
    </div>
  );
}
