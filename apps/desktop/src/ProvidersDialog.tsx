import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/shared/ui/dialog";
import { ENGINES } from "@weave/agent/engines-registry.ts";
import { getProviderIcon } from "@/shared/ui/icons/ProviderIcons";
import { CheckIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";

const MOCK_INSTALLED = ["claude-code", "codex", "antigravity"];
const SUBTITLES: Record<string, { desc: string; detail?: string }> = {
  "claude-code": { desc: "Anthropic's agentic coding tool", detail: "Installed via app bundle · v2.1.257" },
  codex: { desc: "OpenAI's coding agent", detail: "Installed via app bundle · v0.153.4" },
  amp: { desc: "Sourcegraph Amp coding agent" },
  gemini: { desc: "Google's Gemini CLI agent" },
  antigravity: { desc: "Google's Antigravity agent", detail: "Installed via app bundle · v1.0.0" },
};

export function ProvidersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border/50 bg-muted/30">
          <DialogTitle className="text-xl font-medium tracking-tight">AI providers</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <div className="flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium">Agent harnesses</h3>
                <p className="text-sm text-muted-foreground">Connect a model provider to use Goose, or connect another agent harness.</p>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-full hover:bg-secondary/60 transition-colors">
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </button>
            </div>

            <div className="flex flex-col divide-y border-t border-border/50">
              {Object.values(ENGINES).map((engine) => {
                const installed = MOCK_INSTALLED.includes(engine.id);
                const info = SUBTITLES[engine.id] || { desc: `${engine.label} agent` };
                
                return (
                  <div key={engine.id} className="flex items-center justify-between py-4 group">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="pt-1 shrink-0">
                        {getProviderIcon(engine.id, "size-5")}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{engine.label}</span>
                        <span className="text-sm text-muted-foreground truncate">{info.desc}</span>
                        {info.detail && (
                          <span className="text-xs text-muted-foreground/70 mt-1 truncate">{info.detail}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center shrink-0 ml-4 h-8">
                      {installed ? (
                        <>
                          <CheckIcon className="size-5 text-emerald-500 mr-2 group-hover:hidden" />
                          <button className="hidden group-hover:flex items-center gap-1.5 px-3 py-1 text-xs font-medium border border-destructive/30 text-destructive rounded-full hover:bg-destructive/10 transition-colors">
                            <Trash2Icon className="size-3.5" />
                            Remove
                          </button>
                        </>
                      ) : (
                        <button className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-full hover:bg-secondary/60 transition-colors">
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
