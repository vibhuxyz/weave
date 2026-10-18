import { OrbitIcon, XIcon } from "lucide-react";
import { ComposerActionButton } from "@/shared/ui";

interface MultitaskChipProps {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}

export function MultitaskChip({ on, onChange }: MultitaskChipProps) {
  if (on) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-splash-violet/15 px-2.5 text-xs font-medium text-splash-violet">
        <OrbitIcon className="size-3.5 shrink-0" aria-hidden />
        <span>Multitask</span>
        <button
          type="button"
          aria-label="Turn off Multitask"
          onClick={() => onChange(false)}
          className="ml-0.5 flex size-4 items-center justify-center rounded-full text-splash-violet hover:bg-splash-violet/20"
        >
          <XIcon className="size-3" aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <ComposerActionButton
      type="button"
      size="sm"
      aria-pressed={false}
      aria-label="Multitask"
      className="chat-composer-selector-trigger"
      leftIcon={<OrbitIcon />}
      onClick={() => onChange(true)}
    >
      <span className="chat-composer-selector-label">Multitask</span>
    </ComposerActionButton>
  );
}
