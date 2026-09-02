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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
