import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { ChevronDownIcon, SlidersHorizontalIcon, SparklesIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";

export interface ConfigPickerProps {
  option: SessionConfigOption;
  value: string | undefined;
  onSelect: (configId: string, value: string) => void;
  disabled?: boolean;
  allOptions?: SessionConfigOption[];
  allValues?: Record<string, string>;
}

/**
 * One composer pill for one agent setting.
 *
 * Nothing here is hardcoded to Claude. Claude Code advertises `model` and
 * `mode` through `newSession().configOptions`; a different ACP agent may
 * advertise other ids, and this renders those instead — the same reason Berd
 * drives model selection through `setSessionConfigOption`, not a model list.
 */
export function ConfigPicker({
  option,
  value,
  onSelect,
  disabled,
  allOptions,
  allValues,
}: ConfigPickerProps) {
  // Booleans need a switch, not a menu — out of scope for now.
  if (option.type !== "select") return null;

  const flat = option.options.flatMap((entry) =>
    "group" in entry ? entry.options : [entry],
  );
  const current = flat.find((entry) => entry.value === value);
  const Icon = option.category === "model" ? SparklesIcon : SlidersHorizontalIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs",
            "transition-colors hover:bg-secondary/80 disabled:opacity-50",
          )}
        >
          <Icon
            className={cn(
              "size-3.5",
              option.category === "model"
                ? "text-orange-400"
                : "text-muted-foreground",
            )}
          />
          <span className="max-w-40 truncate">
            {current?.name ?? option.name}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="min-w-64">
        <DropdownMenuLabel>{option.name}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onSelect(option.id, next)}
        >
          {flat.map((entry) => (
            <DropdownMenuRadioItem key={entry.value} value={entry.value}>
              <div className="flex flex-col gap-0.5">
                <span>{entry.name}</span>
                {entry.description && (
                  <span className="text-muted-foreground text-xs">
                    {entry.description}
                  </span>
                )}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {option.id === "mode" && allOptions && (
          <div className="mt-1 border-t border-border p-1">
            <div className="flex gap-1">
              {["effort", "fast"].map((childId) => {
                const childOpt = allOptions.find((o: SessionConfigOption) => o.id === childId);
                if (!childOpt || childOpt.type !== "select") return null;
                
                const childFlat = childOpt.options.flatMap((e: any) =>
                  "group" in e ? e.options : [e]
                );
                const currentVal = allValues?.[childId];
                const activeIndex = childFlat.findIndex((e: any) => e.value === currentVal);
                const activeEntry = activeIndex >= 0 ? childFlat[activeIndex] : childFlat[0];
                const isActive = activeEntry.name.toLowerCase() !== "off" && activeEntry.name.toLowerCase() !== "false";

                return (
                  <button
                    key={childId}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const nextIndex = (Math.max(0, activeIndex) + 1) % childFlat.length;
                      onSelect(childId, childFlat[nextIndex].value);
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent focus:outline-none"
                    )}
                  >
                    {childOpt.name}: {activeEntry.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
