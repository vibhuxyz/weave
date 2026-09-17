import type { SessionConfigOption } from "@weave/protocol";

export interface EngineItem {
  id: string;
  label: string;
  installed: boolean;
  authenticated?: boolean;
}

export interface EnginePickerProps {
  selectedEngineId?: string;
  engines?: readonly EngineItem[];
  modelOption?: SessionConfigOption;
  modelValue?: string;
  effortOption?: SessionConfigOption;
  effortValue?: string;
  loading?: boolean;
  isSettingModel?: boolean;
  pendingModelValue?: string | null;
  isSwitchingEngine?: boolean;
  targetEngineId?: string | null;
  onSelect: (engineId: string) => void;
  onSelectModel: (configId: string, value: string) => void;
  onSelectEffort?: (value: string) => void;
  onRequestManageProviders: () => void;
}
