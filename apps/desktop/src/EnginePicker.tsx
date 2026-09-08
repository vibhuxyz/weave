import { useState, useEffect } from "react";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { ComposerActionButton } from "@/shared/ui/composer-action-button";
import { CheckIcon, ChevronDownIcon, SparklesIcon } from "lucide-react";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { cn } from "@/shared/lib/cn";
import { flattenConfigValues } from "@/shared/lib/sessionConfig";
import { ENGINES } from "@weave/agent/engines-registry.ts";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import { Spinner } from "@/shared/ui/spinner";

export interface EnginePickerProps {
  selectedEngineId: string | undefined;
  /** Install state from the orchestrator; empty until it reports in. */
  engines: { id: string; label: string; installed: boolean }[];
  /** The running agent's model selector, if it advertises one. */
  modelOption: SessionConfigOption | undefined;
  modelValue: string | undefined;
  loading?: boolean;
  isSettingModel?: boolean;
  pendingModelValue?: string | null;
  isSwitchingEngine?: boolean;
  targetEngineId?: string | null;
  onSelect: (id: string) => void;
  onSelectModel: (configId: string, value: string) => void;
  onRequestManageProviders: () => void;
}

/**
 * Agent on the left, that agent's models on the right.
 *
 * Shows interactive loading states when switching models or agents:
 * - Trigger button spins and indicates loading status
 * - Model list item displays inline spinner while in flight
 * - Agent list item displays inline spinner while switching session
 */
export function EnginePicker({
  selectedEngineId,
  engines,
  modelOption,
  modelValue,
  loading = false,
  isSettingModel = false,
  pendingModelValue,
  isSwitchingEngine = false,
  targetEngineId,
  onSelect,
  onSelectModel,
  onRequestManageProviders,
}: EnginePickerProps) {
  const [open, setOpen] = useState(false);
  const [focusedEngineId, setFocusedEngineId] = useState<string | undefined>(selectedEngineId);
  const [localPendingModelValue, setLocalPendingModelValue] = useState<string | null>(null);
  const [localSwitchingEngineId, setLocalSwitchingEngineId] = useState<string | null>(null);

  // Clear local pending states when values arrive
  useEffect(() => {
    if (localPendingModelValue && modelValue === localPendingModelValue) {
      setLocalPendingModelValue(null);
    }
  }, [modelValue, localPendingModelValue]);

  useEffect(() => {
    if (!isSettingModel && !pendingModelValue) {
      setLocalPendingModelValue(null);
    }
  }, [isSettingModel, pendingModelValue]);

  useEffect(() => {
    if (localSwitchingEngineId && selectedEngineId === localSwitchingEngineId) {
      setLocalSwitchingEngineId(null);
    }
  }, [selectedEngineId, localSwitchingEngineId]);

  useEffect(() => {
    if (!isSwitchingEngine && !targetEngineId) {
      setLocalSwitchingEngineId(null);
    }
  }, [isSwitchingEngine, targetEngineId]);

  // Reset focus when opening/closing
  useEffect(() => {
    if (open) {
      setFocusedEngineId(selectedEngineId);
    }
  }, [open, selectedEngineId]);

  const activePendingModel = pendingModelValue || localPendingModelValue;
  const activeSwitchingEngine = targetEngineId || localSwitchingEngineId;

  const isModelSwitching = Boolean(isSettingModel || activePendingModel);
  const isEngineSwitching = Boolean(isSwitchingEngine || activeSwitchingEngine);
  const isAnyLoading = loading || isModelSwitching || isEngineSwitching;

  const modelValues = flattenConfigValues(modelOption);
  const selectedModel = modelValues.find((entry) => entry.value === modelValue);
  const targetModelEntry = activePendingModel
    ? modelValues.find((entry) => entry.value === activePendingModel)
    : null;
  const selectedEngineLabel = selectedEngineId
    ? ENGINES[selectedEngineId]?.label
    : undefined;
  const targetEngineLabel = activeSwitchingEngine
    ? ENGINES[activeSwitchingEngine]?.label
    : undefined;

  let triggerProviderIcon;
  if (isAnyLoading) {
    triggerProviderIcon = <Spinner className="size-3.5 text-primary animate-spin" decorative />;
  } else if (selectedEngineId) {
    triggerProviderIcon =
      getProviderIcon(selectedEngineId, "size-4") || (
        <SparklesIcon className="size-4 text-orange-500" />
      );
  } else {
    triggerProviderIcon = <SparklesIcon className="size-4 text-muted-foreground" />;
  }

  // Label to show in the trigger button
  let displayLabel: string;
  if (isEngineSwitching && targetEngineLabel) {
    displayLabel = `Switching to ${targetEngineLabel}…`;
  } else if (isModelSwitching && (targetModelEntry?.name || activePendingModel)) {
    displayLabel = targetModelEntry?.name || activePendingModel!;
  } else {
    displayLabel = selectedModel?.name || selectedEngineLabel || "Select Agent";
  }

  // An agent the orchestrator has not reported on yet is treated as usable —
  // an empty list means "not known", not "nothing is installed".
  const installedIds = new Set(
    engines.filter((engine) => engine.installed).map((engine) => engine.id),
  );
  const isInstalled = (engineId: string) =>
    engines.length === 0 || installedIds.has(engineId);

  const displayEngineId = focusedEngineId || selectedEngineId;
  const showsLiveModels =
    Boolean(displayEngineId) && displayEngineId === selectedEngineId;
  const models = showsLiveModels ? modelValues : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ComposerActionButton
          type="button"
          size="sm"
          disabled={loading || isEngineSwitching}
          leftIcon={triggerProviderIcon}
          rightIcon={
            <ChevronDownIcon
              className={cn("size-3.5 opacity-50", isAnyLoading && "animate-pulse")}
            />
          }
          className="chat-composer-selector-trigger group min-w-0 max-w-full"
        >
          <span className="chat-composer-selector-label flex min-w-0 items-baseline gap-1.5 truncate max-w-56">
            <span className="min-w-0 truncate font-medium flex items-center gap-1.5">
              {displayLabel}
              {isAnyLoading && (
                <span className="text-[10px] text-muted-foreground font-normal animate-pulse shrink-0">
                  (loading…)
                </span>
              )}
            </span>
          </span>
        </ComposerActionButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[min(24rem,50vh)] w-[26.25rem] flex-col overflow-hidden p-1 transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
            {/* Agent column */}
            <div className="min-h-0 min-w-0 shrink-0 overflow-hidden w-[11.75rem]">
              <div className="flex h-full w-[11.75rem] min-w-0 p-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between shrink-0 px-2 py-1.5 text-sm font-semibold">
                    <span>Agent</span>
                    {isEngineSwitching && (
                      <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground animate-pulse">
                        <Spinner className="size-2.5 animate-spin text-primary" />
                        Switching…
                      </span>
                    )}
                  </div>
                  <ScrollArea className="min-h-0 min-w-0 flex-1">
                    <div className="space-y-0.5 p-1">
                      {Array.from(
                        new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
                      ).map((engine) => {
                        const isSelected = engine.id === selectedEngineId;
                        const isFocused = engine.id === focusedEngineId;
                        const engineIcon = getProviderIcon(engine.id, "size-4");
                        const installed = isInstalled(engine.id);
                        const isEngineTarget =
                          isEngineSwitching && activeSwitchingEngine === engine.id;

                        return (
                          <button
                            key={engine.id}
                            disabled={isEngineSwitching}
                            onMouseEnter={() => setFocusedEngineId(engine.id)}
                            onClick={() => {
                              setFocusedEngineId(engine.id);
                              if (!installed) {
                                onRequestManageProviders();
                                setOpen(false);
                                return;
                              }
                              setLocalSwitchingEngineId(engine.id);
                              onSelect(engine.id);
                              setOpen(false);
                            }}
                            data-picker-nav-item
                            data-selected={isFocused || undefined}
                            className={cn(
                              "flex min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-sm transition-colors group",
                              "hover:bg-accent focus-visible:bg-accent focus:outline-none",
                              isFocused && "bg-accent",
                              !installed && "opacity-80",
                              isEngineTarget && "bg-accent/60 font-medium",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {engineIcon && <span className="shrink-0">{engineIcon}</span>}
                              <span className="min-w-0 truncate">{engine.label}</span>
                            </div>
                            {isEngineTarget ? (
                              <Spinner className="size-3.5 shrink-0 text-primary animate-spin" />
                            ) : installed ? (
                              isSelected && (
                                <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                              )
                            ) : (
                              <span className="shrink-0 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                Connect
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>

            {/* Model column */}
            <div className="flex min-h-0 min-w-0 overflow-hidden p-1 ml-1 w-56 shrink-0">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between shrink-0 px-2 py-1.5 text-sm font-semibold">
                  <span>Model</span>
                  {isModelSwitching && (
                    <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground animate-pulse">
                      <Spinner className="size-2.5 animate-spin text-primary" />
                      Loading…
                    </span>
                  )}
                </div>
                <ScrollArea className="min-h-0 min-w-0 flex-1">
                  <div className="space-y-0.5 p-1">
                    {models.length > 0 ? (
                      models.map((model) => {
                        const isSelected = model.value === modelValue;
                        const isThisModelLoading =
                          isModelSwitching && activePendingModel === model.value;

                        return (
                          <button
                            key={model.value}
                            disabled={isModelSwitching}
                            onClick={() => {
                              if (modelOption) {
                                setLocalPendingModelValue(model.value);
                                onSelectModel(modelOption.id, model.value);
                              }
                              // Auto-close after brief delay so user sees selection and loading state
                              setTimeout(() => setOpen(false), 180);
                            }}
                            data-picker-nav-item
                            data-selected={isSelected || undefined}
                            className={cn(
                              "flex min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                              "hover:bg-accent focus-visible:bg-accent focus:outline-none",
                              isSelected && "bg-accent font-medium",
                              isThisModelLoading && "bg-accent/70 font-medium",
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{model.name}</span>
                            {isThisModelLoading ? (
                              <Spinner className="size-3.5 shrink-0 text-primary animate-spin" />
                            ) : isSelected ? (
                              <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-2 py-2 text-sm text-muted-foreground">
                        {!displayEngineId
                          ? "Select an agent first"
                          : showsLiveModels
                          ? `${selectedEngineLabel ?? "This agent"} has no model setting`
                          : `Switch to ${ENGINES[displayEngineId]?.label ?? "this agent"} to see its models`}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
