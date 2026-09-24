import { useState } from "react";
import type { ConversationMeta } from "@/features/chat/hooks";
import { CollapseReveal, DisclosureButton } from "@/shared/ui";
import { ChatRow } from "./ChatRow";

const BASE_VISIBLE_CHATS = 5;
const EXPANDED_VISIBLE_CHATS = 20;
const UNTITLED_CHAT = "New chat";
const DISCLOSURE_CLASS = "h-auto justify-start rounded-sm py-1 text-xs";

type Reveal = "base" | "more" | "all";

interface ProjectChatListProps {
  chats: readonly ConversationMeta[];
  activeSessionId: string | null;
  onOpenChat: (sessionId: string) => void;
  onArchiveChat: (chat: ConversationMeta) => void;
  busySessionId: string | null;
  draftSessionId?: string | null;
  className?: string;
  emptyLabel?: string | null;
}

export function baseVisibleCount(chatCount: number, activeIndex: number): number {
  const withActive = activeIndex >= BASE_VISIBLE_CHATS ? Math.min(activeIndex + 1, EXPANDED_VISIBLE_CHATS) : BASE_VISIBLE_CHATS;
  return Math.min(chatCount, withActive);
}

export function ProjectChatList({
  chats,
  activeSessionId,
  onOpenChat,
  onArchiveChat,
  busySessionId,
  draftSessionId = null,
  className = "pl-6",
  emptyLabel = "No chats yet",
}: ProjectChatListProps) {
  const [reveal, setReveal] = useState<Reveal>("base");
  const activeIndex = activeSessionId ? chats.findIndex((chat) => chat.id === activeSessionId) : -1;
  const baseCount = baseVisibleCount(chats.length, activeIndex);
  const extraLimit = reveal === "all" ? chats.length : EXPANDED_VISIBLE_CHATS;
  const extraChats = chats.slice(baseCount, Math.max(baseCount, extraLimit));
  const hasHiddenBeyondExpanded = chats.length > EXPANDED_VISIBLE_CHATS && reveal !== "all";

  if (chats.length === 0) {
    return emptyLabel ? <p className="h-7 py-1 pl-8 pr-3 text-[13px] text-sidebar-text-tertiary">{emptyLabel}</p> : null;
  }

  const renderRow = (chat: ConversationMeta) => (
    <ChatRow
      key={chat.id}
      title={chat.title || UNTITLED_CHAT}
      updatedAt={chat.updatedAt}
      active={chat.id === activeSessionId}
      onClick={() => onOpenChat(chat.id)}
      onArchive={chat.id === draftSessionId ? undefined : () => onArchiveChat(chat)}
      isArchiveDisabled={chat.id === busySessionId}
    />
  );

  return (
    <div className={`flex flex-col gap-0.5 pb-1 pr-1 ${className}`}>
      {chats.slice(0, baseCount).map(renderRow)}
      {extraChats.length > 0 && (
        <CollapseReveal open={reveal !== "base"}>
          <div className="flex flex-col gap-0.5">{extraChats.map(renderRow)}</div>
          <div className="flex items-center px-2">
            <DisclosureButton type="button" surface="sidebar" onClick={() => setReveal("base")} className={DISCLOSURE_CLASS}>
              Show less
            </DisclosureButton>
            {hasHiddenBeyondExpanded && (
              <DisclosureButton
                type="button"
                surface="sidebar"
                onClick={() => setReveal("all")}
                className={`${DISCLOSURE_CLASS} ml-auto`}
              >
                View all {chats.length} chats
              </DisclosureButton>
            )}
          </div>
        </CollapseReveal>
      )}
      {reveal === "base" && extraChats.length > 0 && (
        <DisclosureButton
          type="button"
          surface="sidebar"
          onClick={() => setReveal("more")}
          className={`${DISCLOSURE_CLASS} w-full px-2 animate-in fade-in-0 duration-300`}
        >
          View more chats
        </DisclosureButton>
      )}
    </div>
  );
}
