import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { AlertTriangleIcon, FileEditIcon, TerminalIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import type { CheckpointBlock as CheckpointBlockModel, BlockAction } from "../normalize/types";

export function CheckpointBlock({
  block,
  onAction,
}: {
  block: CheckpointBlockModel;
  onAction?: (action: BlockAction) => void;
}) {
  const reasonLabels = {
    provider_limit: "Provider limit reached",
    user_cancelled: "Cancelled by user",
    error: "Agent encountered an error",
    max_turns: "Maximum turns reached",
    explicit_handoff: "Handoff requested",
  };

  return (
    <section className="overflow-hidden rounded-lg border border-agent-high/40 bg-agent-high-bg shadow-sm">
      <div className="flex items-center gap-3 border-b border-agent-high/20 bg-agent-high-bg px-4 py-3">
        <AlertTriangleIcon className="size-4 text-agent-high-fg" />
        <h3 className="font-medium text-agent-high-fg text-sm">Task Interrupted</h3>
        <Badge variant="outline" className="ml-auto border-agent-high/30 text-agent-high-fg text-xs">
          {block.checkpointId}
        </Badge>
      </div>

      <div className="p-4">
        <p className="mb-4 font-medium text-agent-text-strong text-sm">{reasonLabels[block.reason]}</p>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={FileEditIcon} label="Files modified" value={block.summary.filesModified} />
          <Stat icon={TerminalIcon} label="Commands" value={block.summary.commandsExecuted} />
          <Stat icon={CheckCircleIcon} label="Tests passed" value={block.summary.testsPassed} color="text-agent-success" />
          <Stat icon={XCircleIcon} label="Tests failed" value={block.summary.testsFailed} color="text-rose-400" />
        </div>

        {block.summary.notes.length > 0 && (
          <ul className="mb-6 list-inside list-disc space-y-1 text-agent-text-muted text-xs">
            {block.summary.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-agent-text-muted">Continue with</p>
          <div className="flex flex-wrap gap-2">
            {block.availableEngines.filter(e => e.capabilities.handoff).map((engine) => (
              <Button
                key={engine.id}
                type="button"
                variant="outline"
                size="sm"
                className="bg-agent-high-bg hover:bg-agent-surface-hover hover:text-agent-text-bright border-agent-high/30 text-agent-high-fg"
                onClick={() => onAction?.({ type: "continue_with_engine", engineId: engine.id, checkpointId: block.checkpointId })}
              >
                {engine.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, color = "text-agent-text-muted" }: { icon: any, label: string, value: number, color?: string }) {
  return (
    <div className="rounded-md border border-agent-border-subtle bg-black/20 p-2.5">
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${color}`} />
        <span className="font-medium text-agent-text-bright text-lg">{value}</span>
      </div>
      <p className="mt-1 text-agent-text-muted text-xs">{label}</p>
    </div>
  );
}
