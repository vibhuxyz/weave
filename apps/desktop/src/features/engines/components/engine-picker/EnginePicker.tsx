import { useCallback, useMemo, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { flattenConfigValues } from "@/shared/lib";
import type { EnginePickerProps } from "./types";
import { EnginePickerPanel } from "./EnginePickerPanel";
import { EnginePickerTrigger } from "./EnginePickerTrigger";
import { REASONING_EFFORTS } from "./constants";

export function EnginePicker({
  selectedEngineId,
  engines,
  modelOption,
  modelValue,
  effortOption,
  effortValue,
  loading,
  isSettingModel,
  pendingModelValue,
  isSwitchingEngine,
  targetEngineId,
  onSelect,
  onSelectModel,
  onSelectEffort,
  onRequestManageProviders,
}: EnginePickerProps) {
  const [open, setOpen] = useState(false);
  const [isSwitchingAgent, setIsSwitchingAgent] = useState(false);
  const [focusedEngineId, setFocusedEngineId] = useState<string>("");
  const [localModelValue, setLocalModelValue] = useState<string | null>(null);

  const checkConnected = useCallback(
    (id?: string | null): boolean => {
      if (!id) return false;
      const norm = id === "gemini" ? "antigravity" : id;
      const match = engines?.find((e) => {
        const eNorm = e.id === "gemini" ? "antigravity" : e.id;
        return eNorm === norm && e.installed && e.authenticated;
      });
      return Boolean(match);
    },
    [engines],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFocusedEngineId(selectedEngineId || "");
      setIsSwitchingAgent(false);
    }
    setOpen(nextOpen);
  };

  const activeEngineId = focusedEngineId || selectedEngineId || "";
  const isAgentConnected = checkConnected(activeEngineId);

  const liveModelValues = useMemo(
    () => flattenConfigValues(modelOption),
    [modelOption],
  );

  const activeModelValue = pendingModelValue ?? localModelValue ?? modelValue;
  const loadingEngineId = isSwitchingEngine ? targetEngineId ?? focusedEngineId : null;
  const isLoadingOptions = Boolean(isSwitchingEngine) || (isAgentConnected && liveModelValues.length === 0);

  const handleSelectAgent = (agentId: string, isReady: boolean) => {
    if (!isReady) return;
    setFocusedEngineId(agentId);
    if (
      agentId !== selectedEngineId &&
      !(agentId === "gemini" && selectedEngineId === "antigravity") &&
      !(selectedEngineId === "gemini" && agentId === "antigravity")
    ) {
      onSelect(agentId);
    }
  };

  const handleSelectModel = (modelId: string) => {
    if (!isAgentConnected) return;
    setLocalModelValue(modelId);
    if (modelOption) {
      onSelectModel(modelOption.id, modelId);
    }
    setOpen(false);
  };

  const handleSelectEffort = (effort: string) => {
    if (!isAgentConnected || !onSelectEffort) return;
    onSelectEffort(effort);
  };

  const displayModelName =
    liveModelValues.find((m) => m.value === activeModelValue)?.name ||
    activeModelValue ||
    "Select model";

  const displayEffortLabel =
    effortOption && effortValue
      ? REASONING_EFFORTS.find((e) => e.value === effortValue)?.label || effortValue
      : undefined;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <div>
          <EnginePickerTrigger
            engineId={selectedEngineId}
            isConnected={checkConnected(selectedEngineId)}
            modelName={displayModelName}
            effortLabel={displayEffortLabel || ""}
            loading={Boolean(loading || isSettingModel || isSwitchingEngine)}
            onClick={() => handleOpenChange(!open)}
          />
        </div>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#1e1e1e] shadow-2xl animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
          <EnginePickerPanel
            isShowingAgents={isSwitchingAgent || !isAgentConnected}
            isAgentConnected={isAgentConnected}
            hasEffortOption={Boolean(effortOption)}
            isLoadingOptions={isLoadingOptions}
            loadingEngineId={loadingEngineId}
            activeEngineId={activeEngineId}
            engines={engines}
            models={liveModelValues}
            selectedModelValue={activeModelValue || ""}
            selectedEffortValue={effortValue || ""}
            onSelectAgent={handleSelectAgent}
            onSelectModel={handleSelectModel}
            onSelectEffort={handleSelectEffort}
            onSwitchAgent={() => setIsSwitchingAgent(true)}
            onRequestManageProviders={() => {
              onRequestManageProviders();
              setOpen(false);
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
