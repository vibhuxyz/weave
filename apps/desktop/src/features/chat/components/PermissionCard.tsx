import { ShieldAlertIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import type { PermissionRequest } from "@/features/chat/hooks";

const ALLOW_KINDS = new Set(["allow_once", "allow_always"]);

function isAllow(kind: string): boolean {
  return ALLOW_KINDS.has(kind);
}

/**
 * The agent is blocked on this: its ACP request stays open until one of these
 * options goes back. The options are the agent's own — we render what it
 * offered, in its order, and never invent a choice it did not give.
 */
export function PermissionCard({
  request,
  onAnswer,
}: {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
}) {
  return (
    <div
      className="dark w-full rounded-xl border border-agent-warn/40 bg-agent-warn-bg"
      role="alertdialog"
      aria-label={`Permission needed: ${request.title}`}
    >
      <div className="flex items-start gap-2.5 border-agent-warn/20 border-b px-4 py-3">
        <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-agent-warn" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-agent-warn text-sm">
            Permission needed
          </span>
          <span className="text-agent-text text-xs">{request.title}</span>
          {request.command && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-agent-code-bg p-2 font-mono text-[11px] text-agent-text-muted">
              {request.command}
            </pre>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        {request.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            onClick={() => onAnswer(request.requestId, option.optionId)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isAllow(option.kind)
                ? "bg-white text-black hover:bg-zinc-200"
                : "border border-agent-border text-agent-text hover:bg-agent-surface-hover",
            )}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
