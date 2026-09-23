import { invoke } from "@tauri-apps/api/core";
import { QueryClient } from "@tanstack/react-query";
import { normalizeProviderId } from "@weave/providers";
import type { HarnessAuthMethodInfo } from "../components/types";

export interface ProviderReport {
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

export interface AgentSetupEvent {
  readonly state: "checking" | "not_installed" | "auth_required" | "authenticating" | "authenticated" | "failed";
  readonly provider: string;
  readonly methods?: readonly HarnessAuthMethodInfo[];
  readonly error?: string;
}

export const PROVIDER_REPORTS_QUERY_KEY = ["provider-reports"] as const;
export const PROVIDER_REPORTS_STALE_TIME_MS = 5 * 60 * 1000;
export const fallbackQueryClient = new QueryClient();

export function fetchProviderReports(): Promise<ProviderReport[]> {
  return invoke<ProviderReport[]>("list_providers_command");
}

export function applySetupEvent(
  reports: readonly ProviderReport[] | undefined,
  { provider, state, error, methods }: AgentSetupEvent,
): ProviderReport[] | undefined {
  const providerId = normalizeProviderId(provider);
  return reports?.map((report) =>
    report.providerId === providerId
      ? {
          ...report,
          installed: state !== "not_installed",
          authenticated: state === "authenticated",
          authMethods: methods ?? report.authMethods,
          error: error ?? report.error,
        }
      : report,
  );
}
