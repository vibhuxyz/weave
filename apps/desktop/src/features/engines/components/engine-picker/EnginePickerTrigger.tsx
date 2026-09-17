import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { ComposerActionButton } from "@/shared/ui";
import { getProviderIcon } from "@/shared/ui/icons";

interface EnginePickerTriggerProps {
  engineId?: string | null;
  isConnected?: boolean;
  modelName: string;
  effortLabel: string;
  loading: boolean;
  onClick: () => void;
}

export function EnginePickerTrigger({
  engineId,
  isConnected = false,
  modelName,
  effortLabel,
  loading,
  onClick,
}: EnginePickerTriggerProps) {
  const icon = loading ? (
    <RefreshCwIcon className="size-4 animate-spin text-zinc-400" />
  ) : isConnected && engineId ? (
    getProviderIcon(engineId, "size-4") || null
  ) : null;

  return (
    <ComposerActionButton
      type="button"
      size="sm"
      leftIcon={icon}
      rightIcon={<ChevronDownIcon className="size-3.5 opacity-50" />}
      onClick={onClick}
    >
      <span className="flex items-center gap-1.5 text-sm font-normal">
        <span className="font-medium text-foreground">{modelName}</span>
        {isConnected && effortLabel ? (
          <span className="text-zinc-400">{effortLabel}</span>
        ) : null}
      </span>
    </ComposerActionButton>
  );
}
