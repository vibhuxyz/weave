import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeProviderId } from "@weave/providers";
import type { HarnessDescriptor, HarnessInstallLog, HarnessAuthMethodInfo } from "../components/types";

interface ProviderReport {
  readonly providerId: string;
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly usable: boolean;
  readonly version?: string;
  readonly authMethods?: readonly HarnessAuthMethodInfo[];
  readonly capabilities?: {
    readonly models: boolean;
    readonly reasoning: boolean;
    readonly tools: boolean;
    readonly sessions: boolean;
  };
  readonly error?: string;
}

interface AgentSetupEvent {
  readonly state: "checking" | "not_installed" | "auth_required" | "authenticating" | "authenticated" | "failed";
  readonly provider: string;
  readonly methods?: readonly HarnessAuthMethodInfo[];
  readonly error?: string;
}

interface UseHarnessesProps {
  readonly engines?: readonly { id: string; label: string; installed: boolean; authenticated?: boolean }[];
  readonly onRefreshEngines?: () => void;
  readonly onAuthenticate?: (url: string) => void;
}

export function useHarnesses({
  engines,
  onRefreshEngines,
  onAuthenticate,
}: UseHarnessesProps = {}) {
  const [providerReports, setProviderReports] = useState<Map<string, ProviderReport>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [activeLog, setActiveLog] = useState<HarnessInstallLog | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const applyReports = useCallback((reports: readonly ProviderReport[]) => {
    const nextMap = new Map<string, ProviderReport>();
    for (const r of reports) {
      nextMap.set(r.providerId, r);
    }
    setProviderReports(nextMap);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const reports = await invoke<ProviderReport[]>("list_providers_command");
      applyReports(reports);
      if (onRefreshEngines) {
        onRefreshEngines();
      }
    } catch (err) {
      console.error("Failed to list providers:", err);
      setErrorMessage(String(err));
    } finally {
      setRefreshing(false);
    }
  }, [applyReports, onRefreshEngines]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let destroyed = false;

    const setupListener = async () => {
      unlisten = await listen<AgentSetupEvent>("agent-setup:state", (event) => {
        if (destroyed) return;
        const { provider, state, error, methods } = event.payload;
        setProviderReports((prev) => {
          const next = new Map(prev);
          const norm = normalizeProviderId(provider);
          const current = next.get(norm);
          if (current) {
            next.set(norm, {
              ...current,
              installed: state !== "not_installed",
              authenticated: state === "authenticated",
              authMethods: methods ?? current.authMethods,
              error: error ?? current.error,
            });
          }
          return next;
        });

        if (state === "authenticating" || state === "authenticated" || state === "failed") {
          setActiveLog(null);
          setInstallingId(null);
          if (error) {
            setErrorMessage(error);
          }
          if (state === "authenticated") {
            void refresh();
          }
        }
      });
    };

    void setupListener();
    return () => {
      destroyed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh]);

  const removeHarness = useCallback(
    async (harness: HarnessDescriptor) => {
      const norm = normalizeProviderId(harness.id);
      const conf = confirm(
        `Are you sure you want to remove ${harness.id}? This will remove the authentication configuration, but leaving CLI packages globally installed.`,
      );
      if (!conf) return;

      try {
        setInstallingId(norm);
        setErrorMessage(null);
        await invoke("setup_provider_command", { providerId: norm, methodId: "none" });
      } catch (err) {
        console.error("Failed to remove provider:", err);
        setErrorMessage(String(err));
      } finally {
        void refresh();
        setInstallingId(null);
      }
    },
    [refresh],
  );

  const setupHarness = useCallback(
    async (harness: HarnessDescriptor, methodId?: string) => {
      const norm = normalizeProviderId(harness.id);
      setInstallingId(norm);
      setActiveLog(null);
      setErrorMessage(null);

      try {
        const result = await invoke<ProviderReport>("setup_provider_command", {
          providerId: norm,
          methodId,
        });

        if (result.error) {
          setErrorMessage(result.error);
        }

        if (result.authenticated) {
          void refresh();
        }
      } catch (err) {
        console.error("Failed to run setup provider:", err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setInstallingId(null);
      }
    },
    [refresh],
  );

  const isHarnessInstalled = useCallback(
    (harnessId: string) => {
      const norm = normalizeProviderId(harnessId);
      return providerReports.get(norm)?.installed ?? false;
    },
    [providerReports],
  );

  const isHarnessAuthenticated = useCallback(
    (harnessId: string) => {
      const norm = normalizeProviderId(harnessId);
      return providerReports.get(norm)?.authenticated ?? false;
    },
    [providerReports],
  );

  const isHarnessUsable = useCallback(
    (harnessId: string) => {
      const norm = normalizeProviderId(harnessId);
      return providerReports.get(norm)?.usable ?? false;
    },
    [providerReports],
  );

  const getHarnessAuthMethods = useCallback(
    (harnessId: string) => {
      const norm = normalizeProviderId(harnessId);
      return providerReports.get(norm)?.authMethods ?? [];
    },
    [providerReports],
  );

  const getHarnessVersion = useCallback(
    (harnessId: string) => {
      const norm = normalizeProviderId(harnessId);
      return providerReports.get(norm)?.version;
    },
    [providerReports],
  );

  const enrichedEngines = useMemo(() => {
    if (!engines) return [];
    return engines.map((engine) => {
      const report = providerReports.get(normalizeProviderId(engine.id));
      return {
        ...engine,
        installed: report ? report.installed : engine.installed,
        authenticated: report ? report.authenticated : engine.authenticated,
      };
    });
  }, [engines, providerReports]);

  return {
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
    enrichedEngines,
  };
}
