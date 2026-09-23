import { useState, useEffect, useCallback, useContext, useMemo } from "react";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeProviderId } from "@weave/providers";
import type { HarnessDescriptor, HarnessInstallLog } from "../components/types";
import {
  PROVIDER_REPORTS_QUERY_KEY,
  PROVIDER_REPORTS_STALE_TIME_MS,
  applySetupEvent,
  fallbackQueryClient,
  fetchProviderReports,
  type AgentSetupEvent,
  type ProviderReport,
} from "./provider-reports";

interface UseHarnessesProps {
  readonly engines?: readonly {
    id: string;
    label: string;
    installed: boolean;
    authenticated?: boolean;
    authState?: "unknown" | "authenticated" | "auth_required";
  }[];
  readonly onRefreshEngines?: () => void;
  readonly onAuthenticate?: (url: string) => void;
}

export function useHarnesses({
  engines,
  onRefreshEngines,
  onAuthenticate,
}: UseHarnessesProps = {}) {
  const queryClient = useContext(QueryClientContext) ?? fallbackQueryClient;
  const reportsQuery = useQuery(
    {
      queryKey: PROVIDER_REPORTS_QUERY_KEY,
      queryFn: fetchProviderReports,
      staleTime: PROVIDER_REPORTS_STALE_TIME_MS,
      refetchOnWindowFocus: false,
    },
    queryClient,
  );
  const providerReports = useMemo(
    () => new Map((reportsQuery.data ?? []).map((report) => [report.providerId, report])),
    [reportsQuery.data],
  );
  const refreshing = reportsQuery.isFetching;
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [activeLog, setActiveLog] = useState<HarnessInstallLog | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErrorMessage(null);
    onRefreshEngines?.();
    await queryClient.invalidateQueries({ queryKey: PROVIDER_REPORTS_QUERY_KEY });
  }, [onRefreshEngines, queryClient]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let destroyed = false;

    const setupListener = async () => {
      unlisten = await listen<AgentSetupEvent>("agent-setup:state", (event) => {
        if (destroyed) return;
        const { state, error } = event.payload;
        queryClient.setQueryData<ProviderReport[]>(PROVIDER_REPORTS_QUERY_KEY, (reports) =>
          applySetupEvent(reports, event.payload),
        );

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
  }, [queryClient, refresh]);

  const installHarness = useCallback(
    async (harness: HarnessDescriptor) => {
      setInstallingId(normalizeProviderId(harness.id));
      setErrorMessage(null);
      try {
        await invoke("install_engine", { packageName: harness.packageName });
      } catch (err) {
        console.error("Failed to install harness:", err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        void refresh();
        setInstallingId(null);
      }
    },
    [refresh],
  );

  const removeHarness = useCallback(
    async (harness: HarnessDescriptor) => {
      const confirmed = confirm(
        `Remove ${harness.label}? This uninstalls ${harness.packageName} from Weave's engines. Your sign-in with the provider is left alone.`,
      );
      if (!confirmed) return;

      setInstallingId(normalizeProviderId(harness.id));
      setErrorMessage(null);
      try {
        await invoke("uninstall_engine", { packageName: harness.packageName });
      } catch (err) {
        console.error("Failed to remove harness:", err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
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
      const liveAuthState = engine.authState ?? "unknown";
      return {
        ...engine,
        installed: report ? report.installed : engine.installed,
        authenticated:
          liveAuthState !== "unknown"
            ? liveAuthState === "authenticated"
            : report?.authenticated ?? engine.authenticated,
      };
    });
  }, [engines, providerReports]);

  return {
    refreshing,
    installingId,
    activeLog,
    errorMessage: errorMessage ?? (reportsQuery.error ? String(reportsQuery.error) : null),
    refresh,
    setupHarness,
    installHarness,
    removeHarness,
    isHarnessInstalled,
    isHarnessAuthenticated,
    isHarnessUsable,
    getHarnessAuthMethods,
    getHarnessVersion,
    enrichedEngines,
  };
}
