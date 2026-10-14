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

const MODE_DETAIL: Readonly<Record<string, string>> = {
  default: "Ask before edits and new files.",
  acceptedits: "Edit and create files without asking.",
  auto: "Edit and create files without asking.",
  dontask: "Edit and create files without asking.",
  bypasspermissions: "Bypass permissions and execute without asking.",
  alwaysapprove: "Bypass permissions and execute without asking.",
  plan: "Plan the work and don't change files.",
};

export function modeDetail(mode: { readonly id: string; readonly description: string | null }): string | null {
  const key = mode.id.toLowerCase().replace(/[^a-z]/g, "");
  return MODE_DETAIL[key] ?? mode.description;
}

export function hasSelectableModes(modes: SessionModes | null): modes is SessionModes {
  return modes !== null && modes.availableModes.length >= 2;
}

function ModeChoice({
  mode,
}: {
  readonly mode: { readonly id: string; readonly name: string; readonly description: string | null };
}) {
  const detail = modeDetail(mode);
  return (
    <DropdownMenuRadioItem value={mode.id}>
      <span className="flex flex-col">
        <span>{mode.name}</span>
        {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
      </span>
    </DropdownMenuRadioItem>
  );
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
            <ModeChoice key={mode.id} mode={mode} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
