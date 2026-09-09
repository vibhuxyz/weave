import { ChevronDownIcon, TelescopeIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";
import type { DepthLevel } from "./AgentHeader";

const LEVELS: Array<{ value: DepthLevel; label: string; hint: string }> = [
  { value: "brief", label: "Brief", hint: "Headlines only — no code or steps." },
  { value: "normal", label: "Normal", hint: "The full run as the agent reports it." },
  { value: "deep", label: "Deep", hint: "Everything, including tool detail." },
];

/**
 * How much of a run the cards show. It used to sit on the agent header, where
 * it competed with identity; as a composer setting it reads as what it is —
 * a preference for the conversation, not a fact about the run.
 */
export function DepthPicker({
  value,
  onChange,
  disabled,
}: {
  value: DepthLevel;
  onChange: (value: DepthLevel) => void;
  disabled?: boolean;
}) {
  const current = LEVELS.find((level) => level.value === value) ?? LEVELS[1];

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
          <TelescopeIcon className="size-3.5 text-muted-foreground" />
          <span className="max-w-40 truncate">{current.label}</span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-64 p-1">
        <DropdownMenuLabel>Detail</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as DepthLevel)}
        >
          {LEVELS.map((level) => (
            <DropdownMenuRadioItem key={level.value} value={level.value}>
              <div className="flex flex-col gap-0.5">
                <span>{level.label}</span>
                <span className="text-muted-foreground text-xs">{level.hint}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
