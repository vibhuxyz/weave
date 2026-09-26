import { useState, type KeyboardEvent } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import type { PermissionRequest } from "@/features/chat/hooks";
import {
  PromptCard,
  PromptCardHeader,
  PromptCardBody,
  ShortcutKey,
} from "./PromptCard";

const ALLOW_KINDS = new Set(["allow_once", "allow_always"]);

function isAllow(kind: string): boolean {
  return ALLOW_KINDS.has(kind);
}

export function PermissionContent({
  request,
  onAnswer,
}: {
  request: PermissionRequest;
  onAnswer: (requestId: string, optionId: string | null) => void;
}) {
  return (
    <>
      {request.command && (
        <div className="flex flex-col gap-1">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-agent-border/60 bg-agent-surface-inset p-2.5 font-mono text-[12px] text-agent-text-bright">
            {request.command}
          </pre>
        </div>
      )}
      <div className="flex flex-col gap-1.5" role="group" aria-label="Permission choices">
        {request.options.map((option, index) => {
          const isAllowKind = isAllow(option.kind);
          return (
            <button
              key={option.optionId}
              type="button"
              onClick={() => onAnswer(request.requestId, option.optionId)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                isAllowKind
                  ? "bg-agent-surface-inset hover:bg-agent-surface-hover text-agent-text-strong ring-1 ring-agent-border/40 hover:ring-agent-border"
                  : "border border-agent-border/40 text-agent-text-muted hover:bg-agent-surface-hover hover:text-agent-text",
              )}
            >
              <span className="min-w-0 flex-1 text-sm font-medium">{option.name}</span>
              {index < 9 && <ShortcutKey value={index + 1} />}
            </button>
          );
        })}
      </div>
    </>
  );
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onAnswer(request.requestId, null);
      return;
    }
    const num = Number.parseInt(event.key, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= request.options.length) {
      event.preventDefault();
      const opt = request.options[num - 1];
      if (opt) onAnswer(request.requestId, opt.optionId);
    }
  };

  return (
    <PromptCard
      onKeyDown={handleKeyDown}
      role="alertdialog"
      aria-label={`Permission needed: ${request.title}`}
    >
      <PromptCardHeader
        badge="Permission needed"
        badgeVariant="warn"
        icon={<ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-agent-warn" />}
        title={request.title}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(!isCollapsed)}
        onClose={() => onAnswer(request.requestId, null)}
        closeLabel="Dismiss permission"
      />
      {!isCollapsed && (
        <PromptCardBody>
          <PermissionContent request={request} onAnswer={onAnswer} />
        </PromptCardBody>
      )}
    </PromptCard>
  );
}

