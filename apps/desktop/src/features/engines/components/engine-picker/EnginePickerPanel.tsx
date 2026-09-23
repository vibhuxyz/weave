import { cn } from "@/shared/lib";
import type { DisplayModel } from "./constants";
import type { EngineItem } from "./types";
import { AgentListColumn } from "./AgentListColumn";
import { EffortListColumn } from "./EffortListColumn";
import { ModelListColumn } from "./ModelListColumn";
import { SwitchAgentFooter } from "./SwitchAgentFooter";

export interface EnginePickerPanelProps {
  isShowingAgents: boolean;
  isAgentConnected: boolean;
  hasEffortOption: boolean;
  isLoadingOptions: boolean;
  loadingEngineId: string | null;
  activeEngineId: string;
  engines?: readonly EngineItem[];
  models: readonly DisplayModel[];
  selectedModelValue: string;
  selectedEffortValue: string;
  onSelectAgent: (agentId: string, isReady: boolean) => void;
  onSelectModel: (value: string) => void;
  onSelectEffort: (value: string) => void;
  onSwitchAgent: () => void;
  onRequestManageProviders: () => void;
}

export function EnginePickerPanel(props: EnginePickerPanelProps) {
  const isShowingModels = props.isAgentConnected;

  return (
    <div className="flex flex-col p-2">
      <div className={cn("flex gap-3", props.isShowingAgents && isShowingModels && "min-w-[640px]")}>
        {props.isShowingAgents && (
          <AgentListColumn
            activeEngineId={props.activeEngineId}
            engines={props.engines}
            hasRightBorder={false}
            loadingEngineId={props.loadingEngineId}
            onSelectAgent={props.onSelectAgent}
            onRequestManageProviders={props.onRequestManageProviders}
          />
        )}
        {isShowingModels && (
          <ModelListColumn
            models={props.models}
            selectedModelValue={props.selectedModelValue}
            isLoading={props.isLoadingOptions}
            onSelectModel={props.onSelectModel}
          />
        )}
        {isShowingModels && (props.hasEffortOption || props.isLoadingOptions) && (
          <EffortListColumn
            selectedEffortValue={props.selectedEffortValue}
            isLoading={props.isLoadingOptions}
            onSelectEffort={props.onSelectEffort}
          />
        )}
      </div>
      {!props.isShowingAgents && <SwitchAgentFooter onSwitchAgent={props.onSwitchAgent} />}
    </div>
  );
}
