import { RefreshCwIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { DEFAULT_HARNESSES } from "./constants";
import { HarnessRow } from "./HarnessRow";
import { HarnessRowSkeleton } from "./HarnessRowSkeleton";
import type { HarnessDescriptor, HarnessInstallLog, HarnessAuthMethodInfo } from "./types";

const SKELETON_ROW_STAGGER_MS = 120;
const SKELETON_LABEL_WIDTHS = ["w-28", "w-20", "w-24"] as const;
const SKELETON_SUBTITLE_WIDTHS = ["w-48", "w-40", "w-56"] as const;

interface AiProvidersViewProps {
  readonly isInstalled: (id: string) => boolean;
  readonly isAuthenticated: (id: string) => boolean;
  readonly isUsable: (id: string) => boolean;
  readonly getVersion: (id: string) => string | undefined;
  readonly getAuthMethods: (id: string) => readonly HarnessAuthMethodInfo[];
  readonly installingId: string | null;
  readonly activeLog: HarnessInstallLog | null;
  readonly refreshing: boolean;
  readonly errorMessage: string | null;
  readonly onRefresh: () => void;
  readonly onSetup: (harness: HarnessDescriptor, methodId?: string) => void;
  readonly onInstall: (harness: HarnessDescriptor) => void;
  readonly onRemove?: (harness: HarnessDescriptor) => void;
}

export function AiProvidersView({
  isInstalled,
  isAuthenticated,
  isUsable,
  getVersion,
  getAuthMethods,
  installingId,
  activeLog,
  refreshing,
  errorMessage,
  onRefresh,
  onSetup,
  onInstall,
  onRemove,
}: AiProvidersViewProps) {
  const showSkeletons = refreshing && installingId === null;

  return (
    <div className="flex w-full flex-col max-w-4xl mx-auto py-8 px-6 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-white mb-8">
        AI providers
      </h1>

      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 pb-3">
          <div>
            <h2 className="text-base font-medium text-zinc-100">
              Agent harnesses
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Connect an agent harness to start building with Weave.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        <div
          className="flex flex-col divide-y divide-white/10 border-t border-white/10"
          role={showSkeletons ? "status" : undefined}
          aria-busy={showSkeletons || undefined}
          aria-label={showSkeletons ? "Checking agent harnesses" : undefined}
        >
          {DEFAULT_HARNESSES.map((harness, index) =>
            showSkeletons ? (
              <HarnessRowSkeleton
                key={harness.id}
                labelWidth={SKELETON_LABEL_WIDTHS[index] ?? "w-24"}
                subtitleWidth={SKELETON_SUBTITLE_WIDTHS[index] ?? "w-48"}
                delayMs={index * SKELETON_ROW_STAGGER_MS}
              />
            ) : (
              <HarnessRow
                key={harness.id}
                harness={harness}
                isInstalled={isInstalled(harness.id)}
                isAuthenticated={isAuthenticated(harness.id)}
                isUsable={isUsable(harness.id)}
                isInstalling={installingId === harness.id}
                version={getVersion(harness.id)}
                authMethods={getAuthMethods(harness.id)}
                log={activeLog}
                onSetup={onSetup}
                onInstall={onInstall}
                onRemove={onRemove}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
