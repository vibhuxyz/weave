import { useShallow } from "zustand/react/shallow";
import { PromptCardButton } from "@/features/chat/components";
import { selectRouteNote, useRunStore } from "../store";

interface RouteNoteProps {
  readonly onKeepInChat: (request: string) => void;
}

export function RouteNote({ onKeepInChat }: RouteNoteProps) {
  const { reason, request, canKeepInChat } = useRunStore(useShallow(selectRouteNote));
  if (reason === null || request === null) return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-agent-text-muted text-xs">
      <span>The chat agent started this and asked a team to finish it: {reason} The coordinator plans the rest, and you approve that plan before any worker starts.</span>
      {canKeepInChat && (
        <PromptCardButton onClick={() => onKeepInChat(request)}>Keep it in chat</PromptCardButton>
      )}
    </div>
  );
}
