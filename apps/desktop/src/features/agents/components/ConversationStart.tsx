import type { Agent } from "../hooks";
import { AgentAvatar } from "./AgentAvatar";

interface ConversationStartProps {
  readonly agent: Agent | null;
}

export function ConversationStart({ agent }: ConversationStartProps) {
  return (
    <div className="mt-24 flex flex-col items-center gap-4 text-center">
      {agent && (
        <AgentAvatar
          name={agent.name}
          seed={agent.id}
          tint={agent.tint}
          icon={agent.icon}
          character={agent.character}
          size="md"
          className="size-28"
        />
      )}
      <p className="text-sm text-foreground">Start a conversation</p>
    </div>
  );
}
