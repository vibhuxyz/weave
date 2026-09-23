import { ChevronDownIcon } from "lucide-react";
import {
  ComposerActionButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui";
import type { SessionModes } from "@/features/chat/hooks";

/**
 * Whether the composer shows the agent's native modes, which is also what tells
 * the config pills to drop a duplicate `mode` option. Exported so the two
 * cannot drift into rendering the same setting twice.
 */
export function hasSelectableModes(modes: SessionModes | null): modes is SessionModes {
  return modes !== null && modes.availableModes.length >= 2;
}

/**
 * The agent's operating modes, as it reported them. Claude Code offers plan /
 * accept-edits / bypass-permissions; other agents offer their own, or none —
 * in which case this renders nothing rather than inventing a control.
 */
export function ModePicker({
  modes,
  onSelect,
  disabled,
}: {
  modes: SessionModes | null;
  onSelect: (modeId: string) => void;
  disabled?: boolean;
}) {
  if (!hasSelectableModes(modes)) return null;

  const current =
    modes.availableModes.find((mode) => mode.id === modes.currentModeId) ??
    modes.availableModes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <ComposerActionButton
          type="button"
          size="sm"
          rightIcon={<ChevronDownIcon className="size-3.5 opacity-50" />}
          className="chat-composer-selector-trigger"
          aria-label={`Agent mode: ${current?.name ?? "default"}`}
        >
          {current?.name ?? "Mode"}
        </ComposerActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Agent mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={modes.currentModeId}
          onValueChange={onSelect}
        >
          {modes.availableModes.map((mode) => (
            <DropdownMenuRadioItem key={mode.id} value={mode.id}>
              <span className="flex flex-col">
                <span>{mode.name}</span>
                {mode.description && (
                  <span className="text-muted-foreground text-xs">
                    {mode.description}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
