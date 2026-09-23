import { useState, type ReactNode } from "react";
import { normalizeProviderId } from "@weave/providers";
import { SettingsSidebar } from "./SettingsSidebar";
import { AiProvidersView } from "./AiProvidersView";
import { useHarnesses } from "../hooks/useHarnesses";
import type { HarnessDescriptor, SettingsTabId } from "./types";

const TERMINAL_SIGN_IN_ENGINES: ReadonlyMap<string, string> = new Map([["antigravity-acp", "antigravity"]]);

interface SettingsViewProps {
  readonly initialTab?: SettingsTabId;
  readonly engines?: readonly { id: string; label: string; installed: boolean }[];
  readonly onRefreshEngines?: () => void;
  readonly onBack?: () => void;
  readonly onSignInWithEngine?: (engineId: string) => void;
  readonly behaviorSettings?: ReactNode;
}

const noop = () => {};

export function SettingsView({
  initialTab = "ai-providers",
  engines,
  onRefreshEngines,
  onBack = noop,
  onSignInWithEngine,
  behaviorSettings,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const {
    refreshing,
    installingId,
    activeLog,
    errorMessage,
    refresh,
    setupHarness,
    installHarness,
    removeHarness,
    isHarnessInstalled,
    isHarnessAuthenticated,
    isHarnessUsable,
    getHarnessAuthMethods,
    getHarnessVersion,
  } = useHarnesses({ engines, onRefreshEngines });

  const handleSetup = (harness: HarnessDescriptor, methodId?: string) => {
    const signInEngineId = TERMINAL_SIGN_IN_ENGINES.get(normalizeProviderId(harness.id));
    if (signInEngineId && onSignInWithEngine) {
      onSignInWithEngine(signInEngineId);
      return;
    }
    void setupHarness(harness, methodId);
  };

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
            onSetup={handleSetup}
            onInstall={installHarness}
            onRemove={removeHarness}
          />
        ) : activeTab === "behavior" && behaviorSettings ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-10 py-12">
            <h1 className="text-2xl font-semibold text-white">Behavior</h1>
            {behaviorSettings}
          </div>
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
