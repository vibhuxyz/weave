import { useCallback, useEffect, useMemo, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn, flattenConfigValues, splitConfigOptions } from "@/shared/lib";
import type { EnginePickerProps } from "./types";
import { AgentListColumn } from "./AgentListColumn";
import { ModelListColumn } from "./ModelListColumn";
import { EffortListColumn } from "./EffortListColumn";
import { EnginePickerTrigger } from "./EnginePickerTrigger";
import { DISPLAY_AGENTS, REASONING_EFFORTS, type DisplayModel } from "./constants";

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
  onSelect,
  onSelectModel,
  onSelectEffort,
  onRequestManageProviders,
}: EnginePickerProps) {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (open) {
      setFocusedEngineId(selectedEngineId || "");
    }
  }, [open, selectedEngineId]);

  const activeEngineId = focusedEngineId || selectedEngineId || "";
  const isAgentConnected = checkConnected(activeEngineId);

  const liveModelValues = useMemo(
    () => flattenConfigValues(modelOption),
    [modelOption],
  );

  const activeModelValue = pendingModelValue ?? localModelValue ?? modelValue;

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
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <div>
          <EnginePickerTrigger
            engineId={selectedEngineId}
            isConnected={checkConnected(selectedEngineId)}
            modelName={displayModelName}
            effortLabel={displayEffortLabel || ""}
            loading={loading || isSettingModel || false}
            onClick={() => setOpen(!open)}
          />
        </div>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={8}
          className="z-50 flex overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] shadow-xl animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
          <div
            className={cn(
              "flex p-2 transition-all duration-200",
              isAgentConnected && effortOption ? "min-w-[530px]" : isAgentConnected ? "min-w-[340px]" : "min-w-[210px]",
            )}
          >
            <AgentListColumn
              activeEngineId={activeEngineId}
              engines={engines}
              hasRightBorder={isAgentConnected}
              onSelectAgent={handleSelectAgent}
              onRequestManageProviders={() => {
                onRequestManageProviders();
                setOpen(false);
              }}
            />
            {isAgentConnected && (
              <>
                <ModelListColumn
                  models={liveModelValues}
                  selectedModelValue={activeModelValue || ""}
                  onSelectModel={handleSelectModel}
                />
                {effortOption && (
                  <EffortListColumn
                    selectedEffortValue={effortValue || ""}
                    onSelectEffort={handleSelectEffort}
                  />
                )}
              </>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
