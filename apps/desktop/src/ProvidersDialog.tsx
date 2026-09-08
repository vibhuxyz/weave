import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/shared/ui/dialog";
import { ENGINES, type EngineDescriptor } from "@weave/agent/engines-registry.ts";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import { CheckIcon, PlusIcon, RefreshCwIcon, Trash2Icon, MessageSquareIcon } from "lucide-react";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/cn";

const SUBTITLES: Record<string, { desc: string; detail?: string }> = {
  "claude-code": { desc: "Anthropic's agentic coding CLI", detail: "@agentclientprotocol/claude-agent-acp" },
  codex: { desc: "OpenAI's coding agent", detail: "@agentclientprotocol/codex-acp" },
  amp: { desc: "Sourcegraph Amp coding agent", detail: "@sourcegraph/amp" },
  antigravity: { desc: "Google's Antigravity agent", detail: "agy-acp" },
};

export interface ProvidersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engines?: { id: string; label: string; installed: boolean }[];
  currentEngineId?: string | null;
  installingEngine?: string | null;
  onInstall?: (packageName: string, engineId: string) => Promise<void>;
  onUninstall?: (packageName: string, engineId: string) => Promise<void>;
  onSelectEngine?: (engineId: string) => void;
  onRefresh?: () => void;
}

export function ProvidersDialog({
  open,
  onOpenChange,
  engines = [],
  currentEngineId,
  installingEngine,
  onInstall,
  onUninstall,
  onSelectEngine,
  onRefresh,
}: ProvidersDialogProps) {
  const [localInstalled, setLocalInstalled] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [localInstalling, setLocalInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync from props engines if available
  useEffect(() => {
    if (engines.length > 0) {
      setLocalInstalled(new Set(engines.filter((e) => e.installed).map((e) => e.id)));
    }
  }, [engines]);

  // Query Tauri backend directly as well
  const checkInstalled = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const ids = await invoke<string[]>("check_installed_engines");
      setLocalInstalled((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      onRefresh?.();
    } catch (e) {
      console.warn("Could not query installed engines from Tauri:", e);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (open) {
      void checkInstalled();
    }
  }, [open, checkInstalled]);

  const activeInstalling = installingEngine || localInstalling;

  const handleInstallClick = async (engine: EngineDescriptor) => {
    setError(null);
    setLocalInstalling(engine.id);
    try {
      if (onInstall) {
        await onInstall(engine.packageName, engine.id);
      } else {
        await invoke("install_engine", { packageName: engine.packageName });
      }
      setLocalInstalled((cur) => new Set([...cur, engine.id]));
      await checkInstalled();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalInstalling(null);
    }
  };

  const handleUninstallClick = async (engine: EngineDescriptor) => {
    setError(null);
    setLocalInstalling(engine.id);
    try {
      if (onUninstall) {
        await onUninstall(engine.packageName, engine.id);
      } else {
        await invoke("uninstall_engine", { packageName: engine.packageName });
      }
      setLocalInstalled((cur) => {
        const next = new Set(cur);
        next.delete(engine.id);
        return next;
      });
      await checkInstalled();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalInstalling(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border/50 bg-muted/30">
          <DialogTitle className="text-xl font-medium tracking-tight">AI Providers</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <div className="flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Agent Harnesses</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect agent harnesses locally. Engines run out of your user data directory without requiring workspace installations.
                </p>
              </div>
              <button
                type="button"
                onClick={checkInstalled}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/60 rounded-full hover:bg-secondary/60 transition-colors disabled:opacity-50"
              >
                <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-medium">Action failed:</p>
                <p className="mt-1 whitespace-pre-wrap font-mono">{error}</p>
                {error.includes("Node.js") && (
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-sans underline text-primary"
                  >
                    Download and install Node.js (v20 or higher) →
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-col divide-y border-t border-border/50">
              {Array.from(
                new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
              ).map((engine) => {
                const installed = localInstalled.has(engine.id);
                const isCurrent = currentEngineId === engine.id;
                const isWorking = activeInstalling === engine.id;
                const info = SUBTITLES[engine.id] || { desc: `${engine.label} agent` };

                return (
                  <div key={engine.id} className="flex items-center justify-between py-4 group">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="pt-1 shrink-0">
                        {getProviderIcon(engine.id, "size-5")}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate text-foreground">{engine.label}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{info.desc}</span>
                        {info.detail && (
                          <span className="text-[11px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                            {info.detail}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center shrink-0 ml-4 gap-2">
                      {isWorking ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Spinner className="size-3.5" />
                          <span>Working…</span>
                        </div>
                      ) : installed ? (
                        <>
                          <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <CheckIcon className="size-4" />
                            <span className="hidden sm:inline">Installed</span>
                          </div>

                          {onSelectEngine && !isCurrent && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectEngine(engine.id);
                                onOpenChange(false);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-border/60 rounded-full hover:bg-secondary/60 transition-colors"
                            >
                              <MessageSquareIcon className="size-3" />
                              Use
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleUninstallClick(engine)}
                            title="Uninstall package"
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                          >
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInstallClick(engine)}
                          disabled={!!activeInstalling}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          <PlusIcon className="size-3.5" />
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
