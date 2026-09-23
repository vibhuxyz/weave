import { useId, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import type { Agent } from "@/features/agents/hooks";
import { AgentAvatar } from "./AgentAvatar";

interface AgentQuickComposerProps {
  agent: Agent;
  onStart: (message: string) => void;
}

export function AgentQuickComposer({ agent, onStart }: AgentQuickComposerProps) {
  const inputId = useId();
  const [message, setMessage] = useState("");
  const trimmedMessage = message.trim();

  return (
    <form
      className="fixed bottom-6 right-6 z-20 w-[min(420px,calc(100vw-3rem))] rounded-3xl border border-border/60 bg-card/90 p-3 shadow-2xl backdrop-blur-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onStart(trimmedMessage);
      }}
    >
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-foreground">
        <AgentAvatar name={agent.name} seed={agent.id} tint={agent.tint} icon={agent.icon} character={agent.character} size="xs" />
        {agent.name}
      </span>
      <div className="mt-2 flex items-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          Message {agent.name}
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onStart(trimmedMessage);
            }
          }}
          placeholder="Start a conversation"
          className="min-h-11 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label={`Start a chat with ${agent.name}`}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      </div>
    </form>
  );
}
