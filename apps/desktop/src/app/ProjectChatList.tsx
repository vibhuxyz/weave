import { useState } from "react";
import type { ConversationMeta } from "@/features/chat/hooks";
import { ChatRow } from "./ChatRow";

const MAX_VISIBLE_CHATS = 5;

interface ProjectChatListProps {
  chats: readonly ConversationMeta[];
  activeSessionId: string | null;
  onOpenChat: (sessionId: string) => void;
}

export function ProjectChatList({ chats, activeSessionId, onOpenChat }: ProjectChatListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hiddenCount = Math.max(0, chats.length - MAX_VISIBLE_CHATS);
  const visibleChats = isExpanded ? chats : chats.slice(0, MAX_VISIBLE_CHATS);

  if (chats.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 pl-6 pr-1">
      {visibleChats.map((chat) => (
        <ChatRow
          key={chat.id}
          title={chat.title || "New chat"}
          updatedAt={chat.updatedAt}
          active={chat.id === activeSessionId}
          onClick={() => onOpenChat(chat.id)}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="h-7 rounded-lg px-2 text-left text-xs text-sidebar-text-tertiary transition-colors hover:bg-sidebar-hover hover:text-sidebar-text-primary"
        >
          {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
