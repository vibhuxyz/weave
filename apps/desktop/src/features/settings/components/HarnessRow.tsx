import { useState } from "react";
import { CheckIcon, PlusIcon, ChevronDownIcon } from "lucide-react";
import { getProviderIcon } from "@/shared/ui/icons";
import { Spinner } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { HarnessTerminalLog } from "./HarnessTerminalLog";
import type { HarnessDescriptor, HarnessInstallLog, HarnessAuthMethodInfo } from "./types";

interface HarnessRowProps {
  readonly harness: HarnessDescriptor;
  readonly isInstalled: boolean;
  readonly isAuthenticated: boolean;
  readonly isUsable: boolean;
  readonly isInstalling: boolean;
  readonly version?: string;
  readonly authMethods?: readonly HarnessAuthMethodInfo[];
  readonly log?: HarnessInstallLog | null;
  readonly onSetup: (harness: HarnessDescriptor, methodId?: string) => void;
  readonly onInstall: (harness: HarnessDescriptor) => void;
  readonly onRemove?: (harness: HarnessDescriptor) => void;
}

export function HarnessRow({
  harness,
  isInstalled,
  isAuthenticated,
  isUsable,
  isInstalling,
  version,
  authMethods,
  log,
  onSetup,
  onInstall,
  onRemove,
}: HarnessRowProps) {
  const [showMethods, setShowMethods] = useState(false);
  const showLog = isInstalling && log && log.harnessId === harness.id;
  const isConnected = isAuthenticated && isUsable;

  return (
    <div className="flex flex-col py-4 first:pt-2 last:pb-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="pt-0.5 shrink-0">
            {getProviderIcon(harness.id, "size-5 text-zinc-200") || (
              <div className="size-5 rounded-md bg-zinc-700" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-zinc-100 truncate">
              {harness.label}
            </span>
            <span className="text-xs text-zinc-400 truncate">
              {harness.subtitle}
            </span>
            {version && (
              <span className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {version}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isInstalling ? (
            <div className="flex items-center justify-center p-1">
              <Spinner className="size-4 text-zinc-400" />
            </div>
          ) : isConnected ? (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckIcon className="size-4 text-emerald-500" />
                <span>Connected</span>
              </div>
              <button
                type="button"
                onClick={() => onRemove?.(harness)}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-zinc-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : isInstalled ? (
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSetup(harness)}
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-zinc-200"
              >
                <span>Connect</span>
              </button>
              {authMethods && authMethods.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowMethods(!showMethods)}
                  className="rounded-full border border-white/10 p-1 text-zinc-400 hover:text-zinc-200"
                >
                  <ChevronDownIcon className="size-3" />
                </button>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => onRemove?.(harness)}
                  className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-zinc-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onInstall(harness)}
              className={cn(
                "flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:border-white/25",
              )}
            >
              <PlusIcon className="size-3.5" />
              <span>Install</span>
            </button>
          )}
        </div>
      </div>

      {showMethods && authMethods && authMethods.length > 1 && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-white/10 bg-zinc-900/80 p-2.5">
          <span className="text-[11px] font-medium text-zinc-400 px-1">
            Choose authentication method:
          </span>
          {authMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setShowMethods(false);
                onSetup(harness, m.id);
              }}
              className="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-white/5 transition-colors"
            >
              <span className="font-medium text-zinc-200">{m.name}</span>
              {m.description && (
                <span className="text-[11px] text-zinc-400">{m.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {showLog && <HarnessTerminalLog label={harness.label} log={log} />}
    </div>
  );
}
