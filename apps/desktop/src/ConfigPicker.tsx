import { useState } from "react";
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
import { flattenConfigValues } from "@/shared/lib/sessionConfig";

export interface ConfigPickerProps {
  option: SessionConfigOption;
  value: string | undefined;
  /**
   * Secondary knobs shown as footer buttons in this menu. One row of pills per
   * knob was more chrome than the composer can carry, so everything the agent
   * advertises beyond its main selector lives in here.
   */
  childOptions?: SessionConfigOption[];
  /** Current values for the whole session, read for the footer labels. */
  childValues?: Record<string, string>;
  onSelect: (configId: string, value: string) => void;
  disabled?: boolean;
}

/**
 * The composer's settings pill: the agent's main selector, with its remaining
 * knobs behind footer buttons.
 *
 * Nothing here is hardcoded to Claude. Claude Code advertises `model` and
 * `mode` through `newSession().configOptions`; a different ACP agent may
 * advertise other ids, and this renders those instead — the same reason Berd
 * drives model selection through `setSessionConfigOption`, not a model list.
 */
export function ConfigPicker({
  option,
  value,
  childOptions = [],
  childValues,
  onSelect,
  disabled,
}: ConfigPickerProps) {
  const [open, setOpen] = useState(false);
  /** Which footer knob has taken over the list, if any. */
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  // Booleans need a switch, not a menu — out of scope for now.
  if (option.type !== "select") return null;

  const expandedChild = childOptions.find(
    (child) => child.id === expandedChildId,
  );
  // The knob's values replace the main list rather than sitting beside it, so
  // the menu never shows two sets of radio buttons competing for the same dot.
  const shown = expandedChild ?? option;
  const shownValue = expandedChild ? childValues?.[expandedChild.id] : value;
  const shownValues = flattenConfigValues(shown);

  const current = flattenConfigValues(option).find(
    (entry) => entry.value === value,
  );
  const Icon = option.category === "model" ? SparklesIcon : SlidersHorizontalIcon;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A knob left open would reappear expanded next time, hiding the main
        // list behind what reads as a stuck panel.
        if (!next) setExpandedChildId(null);
      }}
    >
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

      <DropdownMenuContent align="start" side="top" className="w-64 p-1">
        <DropdownMenuLabel>{shown.name}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={shownValue}
          onValueChange={(next) => onSelect(shown.id, next)}
        >
          {shownValues.map((entry) => (
            <DropdownMenuRadioItem
              key={entry.value}
              value={entry.value}
              // A knob is usually one of several being tuned in a row, so it
              // keeps the menu up. Choosing the main setting still dismisses.
              onSelect={
                expandedChild ? (event) => event.preventDefault() : undefined
              }
            >
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

        {childOptions.length > 0 && (
          <div className="mt-1 border-t border-border p-1">
            {/* Two per row: four knobs in one row truncates every label. */}
            <div className="grid grid-cols-2 gap-1">
              {childOptions.map((child) => {
                const childValueList = flattenConfigValues(child);
                const activeEntry = childValueList.find(
                  (entry) => entry.value === childValues?.[child.id],
                );
                const isExpanded = child.id === expandedChildId;

                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={(event) => {
                      // Not a menu item: it swaps the list above rather than
                      // choosing anything, so it must not dismiss the menu.
                      event.preventDefault();
                      setExpandedChildId(isExpanded ? null : child.id);
                    }}
                    aria-expanded={isExpanded}
                    className={cn(
                      "flex min-w-0 items-center justify-center rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
                      "hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent focus:outline-none",
                      isExpanded
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">
                      {child.name}
                      {activeEntry ? `: ${activeEntry.name}` : ""}
                    </span>
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
