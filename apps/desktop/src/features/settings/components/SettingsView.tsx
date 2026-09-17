import { useState } from "react";
import { SettingsSidebar } from "./SettingsSidebar";
import { AiProvidersView } from "./AiProvidersView";
import { useHarnesses } from "../hooks/useHarnesses";
import type { SettingsTabId } from "./types";

interface SettingsViewProps {
  readonly initialTab?: SettingsTabId;
  readonly engines?: readonly { id: string; label: string; installed: boolean }[];
  readonly onRefreshEngines?: () => void;
  readonly onBack?: () => void;
}

const noop = () => {};

export function SettingsView({
  initialTab = "ai-providers",
  engines,
  onRefreshEngines,
  onBack = noop,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const {
    refreshing,
    installingId,
    activeLog,
    errorMessage,
    refresh,
    setupHarness,
    removeHarness,
    isHarnessInstalled,
    isHarnessAuthenticated,
    isHarnessUsable,
    getHarnessAuthMethods,
    getHarnessVersion,
  } = useHarnesses({ engines, onRefreshEngines });

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#121214]">
      <SettingsSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onBack={onBack}
      />

      <main className="flex-1 overflow-y-auto">
        {activeTab === "ai-providers" ? (
          <AiProvidersView
            isInstalled={isHarnessInstalled}
            isAuthenticated={isHarnessAuthenticated}
            isUsable={isHarnessUsable}
            getVersion={getHarnessVersion}
            getAuthMethods={getHarnessAuthMethods}
            installingId={installingId}
            activeLog={activeLog}
            refreshing={refreshing}
            errorMessage={errorMessage}
            onRefresh={refresh}
            onSetup={setupHarness}
            onRemove={removeHarness}
          />
        ) : (
          <div className="flex flex-col py-12 px-10 max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold capitalize text-white">
              {activeTab.replace("-", " ")}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Configure your {activeTab.replace("-", " ")} preferences.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
