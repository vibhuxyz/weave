import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { ComposerActionButton } from "@/shared/ui/composer-action-button";
import { CheckIcon, ChevronDownIcon, SparklesIcon, ArrowLeftRightIcon } from "lucide-react";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { cn } from "@/shared/lib/cn";
import { ENGINES } from "@weave/agent/engines-registry.ts";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import { Spinner } from "@/shared/ui/spinner";

const MOCK_INSTALLED = ["claude-code", "codex", "antigravity"];

const MOCK_MODELS: Record<string, { id: string, label: string }[]> = {
  "claude-code": [
    { id: "claude-fable", label: "Claude Fable 5 1[1m]" },
    { id: "haiku", label: "Haiku" },
    { id: "opus", label: "Opus" },
    { id: "sonnet", label: "Sonnet" },
  ],
  codex: [
    { id: "gpt-5.4-mini", label: "GPT 5.4 Mini" },
    { id: "gpt-5.5", label: "GPT 5.5" },
    { id: "gpt-5.6-luna", label: "GPT 5.6 Luna" },
    { id: "gpt-5.6-terra", label: "GPT 5.6 Terra" },
  ],
  amp: [
    { id: "amp-model", label: "Amp" },
  ],
  gemini: [
    { id: "gemini-flash", label: "Gemini 1.5 Flash" },
    { id: "gemini-pro", label: "Gemini 1.5 Pro" },
  ],
  antigravity: [
    { id: "agy-model", label: "Antigravity" },
  ]
};

export function EnginePicker({
  selectedEngineId,
  loading = false,
  onSelect,
  onRequestManageProviders,
}: {
  selectedEngineId: string | undefined;
  loading?: boolean;
  onSelect: (id: string) => void;
  onRequestManageProviders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedEngineId, setFocusedEngineId] = useState<string | undefined>(selectedEngineId);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Reset focus when opening/closing
  useEffect(() => {
    if (open) {
      setFocusedEngineId(selectedEngineId);
    }
  }, [open, selectedEngineId]);

  // When engine changes, switch model to default if it doesn't exist
  useEffect(() => {
    if (!selectedEngineId) return;
    const models = MOCK_MODELS[selectedEngineId] || [{ id: selectedEngineId, label: ENGINES[selectedEngineId]?.label || "Agent" }];
    if (!models.find(m => m.id === selectedModelId)) {
      setSelectedModelId(models[0].id);
    }
  }, [selectedEngineId, selectedModelId]);

  let triggerProviderIcon;
  if (loading) {
    triggerProviderIcon = <Spinner className="size-4" decorative />;
  } else if (selectedEngineId) {
    triggerProviderIcon = getProviderIcon(selectedEngineId, "size-4") || <SparklesIcon className="size-4 text-orange-500" />;
  } else {
    triggerProviderIcon = <SparklesIcon className="size-4 text-muted-foreground" />;
  }

  const triggerModels = selectedEngineId ? (MOCK_MODELS[selectedEngineId] || [{ id: selectedEngineId, label: ENGINES[selectedEngineId]?.label || "Agent" }]) : [];
  const selectedModel = triggerModels.find(m => m.id === selectedModelId) || triggerModels[0];

  const displayEngineId = focusedEngineId || selectedEngineId;
  const models = displayEngineId ? (MOCK_MODELS[displayEngineId] || [{ id: displayEngineId, label: ENGINES[displayEngineId]?.label || "Agent" }]) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ComposerActionButton
          type="button"
          size="sm"
          disabled={loading}
          leftIcon={triggerProviderIcon}
          rightIcon={<ChevronDownIcon className="size-3.5 opacity-50" />}
          className="chat-composer-selector-trigger group min-w-0 max-w-full"
        >
          <span className="chat-composer-selector-label flex min-w-0 items-baseline gap-1.5 truncate max-w-56">
            <span className="min-w-0 truncate">{selectedModel?.label || "Select Model"}</span>
          </span>
        </ComposerActionButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[min(24rem,50vh)] w-[26.25rem] flex-col overflow-hidden p-1 transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
            {/* Agent column */}
            <div className="min-h-0 min-w-0 shrink-0 overflow-hidden w-[11.75rem]">
              <div className="flex h-full w-[11.75rem] min-w-0 p-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="shrink-0 px-2 py-1.5 text-sm font-semibold">
                    Agent
                  </div>
                  <ScrollArea className="min-h-0 min-w-0 flex-1">
                    <div className="space-y-0.5 p-1">
                      {Object.values(ENGINES).map((engine) => {
                        const isSelected = engine.id === selectedEngineId;
                        const isFocused = engine.id === focusedEngineId;
                        const engineIcon = getProviderIcon(engine.id, "size-4");
                        const installed = MOCK_INSTALLED.includes(engine.id);
                        return (
                          <button
                            key={engine.id}
                            onMouseEnter={() => setFocusedEngineId(engine.id)}
                            onClick={() => {
                              if (!installed) {
                                onRequestManageProviders();
                              }
                              // We don't close or fully select here if they just click the agent,
                              // they need to click a model on the right. Or if we want, we can select the default model.
                              // For now, let's just let hover do the work, or if they click, focus it.
                              setFocusedEngineId(engine.id);
                            }}
                            data-picker-nav-item
                            data-selected={isFocused || undefined}
                            className={cn(
                              "flex min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-sm transition-colors group",
                              "hover:bg-accent focus-visible:bg-accent focus:outline-none",
                              isFocused && "bg-accent",
                              !installed && "opacity-80"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {engineIcon && <span className="shrink-0">{engineIcon}</span>}
                              <span className="min-w-0 truncate">{engine.label}</span>
                            </div>
                            {installed ? (
                              isSelected && <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <span className="shrink-0 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                Connect
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>

            {/* Model column */}
            <div className="flex min-h-0 min-w-0 overflow-hidden p-1 ml-1 w-56 shrink-0">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="shrink-0 px-2 py-1.5 text-sm font-semibold">
                  Model
                </div>
                <ScrollArea className="min-h-0 min-w-0 flex-1">
                  <div className="space-y-0.5 p-1">
                    {models.length > 0 ? (
                      models.map((model) => {
                        const isSelected = displayEngineId === selectedEngineId && model.id === selectedModelId;
                        return (
                          <button
                            key={model.id}
                            onClick={() => {
                              if (displayEngineId) {
                                onSelect(displayEngineId);
                              }
                              setSelectedModelId(model.id);
                              setOpen(false);
                            }}
                            data-picker-nav-item
                            data-selected={isSelected || undefined}
                            className={cn(
                              "flex min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                              "hover:bg-accent focus-visible:bg-accent focus:outline-none",
                              isSelected && "bg-accent"
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{model.label}</span>
                            {isSelected && (
                              <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-2 py-2 text-sm text-muted-foreground">
                        Select an agent first
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
