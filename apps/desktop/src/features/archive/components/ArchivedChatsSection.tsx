import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { SettingsRow, SettingsSection } from "@/shared/ui";
import { OFFLINE_HINT, ROUNDED_LIST_CLASS, UNTITLED_CHAT } from "../constants";
import { formatArchivedDate } from "../lib";
import type { ArchiveLoadState, ArchivedChat, ArchivedChatGroup } from "../types";
import { ArchiveRowActions } from "./ArchiveRowActions";
import { ArchiveRowsSkeleton } from "./ArchiveSkeleton";

interface ArchivedChatsSectionProps {
  readonly groups: readonly ArchivedChatGroup[];
  readonly loadState: ArchiveLoadState;
  readonly onRestore: (sessionId: string, projectDir: string) => void;
  readonly onDelete: (chat: ArchivedChat, projectDir: string) => void;
}

const TITLE = "Archived chats";

function ChatGroup({ group, onRestore, onDelete }: { readonly group: ArchivedChatGroup } & Omit<ArchivedChatsSectionProps, "groups" | "loadState">) {
  const { project, chats } = group;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <DefaultProjectGlyphIcon color={project.tint} className="size-3.5" />
        <span className="truncate">{project.name}</span>
        <span className="tabular-nums">· {chats.length}</span>
      </div>
      <div className={`divide-y divide-border ${ROUNDED_LIST_CLASS}`}>
        {chats.map((chat) => {
          const title = chat.title || UNTITLED_CHAT;
          return (
            <SettingsRow
              key={chat.id}
              className="pr-0"
              density="compact"
              label={title}
              description={formatArchivedDate(chat.archivedAt) ?? undefined}
              action={
                <ArchiveRowActions
                  label={title}
                  onRestore={() => onRestore(chat.id, project.dir)}
                  onDelete={() => onDelete(chat, project.dir)}
                />
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function ArchivedChatsSection({ groups, loadState, onRestore, onDelete }: ArchivedChatsSectionProps) {
  if (loadState === "loading") {
    return (
      <SettingsSection title={TITLE} contentClassName={ROUNDED_LIST_CLASS}>
        <ArchiveRowsSkeleton />
      </SettingsSection>
    );
  }
  if (loadState === "offline" || groups.length === 0) {
    return (
      <SettingsSection title={TITLE}>
        <p className="py-4 text-xs text-muted-foreground">
          {loadState === "offline" ? OFFLINE_HINT : "Archived chats will show here."}
        </p>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection title={TITLE} contentClassName="divide-y-0 space-y-6">
      {groups.map((group) => (
        <ChatGroup key={group.project.dir} group={group} onRestore={onRestore} onDelete={onDelete} />
      ))}
    </SettingsSection>
  );
}
