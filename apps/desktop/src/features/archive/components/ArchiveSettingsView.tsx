import { useMemo, useState } from "react";
import { ConfirmDialog, SettingsSection, SettingsSections } from "@/shared/ui";
import { ROUNDED_LIST_CLASS, UNTITLED_CHAT } from "../constants";
import { archivedProjects, groupArchivedChats } from "../lib";
import type {
  ArchiveActions,
  ArchiveLoadState,
  ArchiveProject,
  ArchivedChat,
  PendingDelete,
} from "../types";
import { ArchivedChatsSection } from "./ArchivedChatsSection";
import { ArchivedProjectsSection } from "./ArchivedProjectsSection";
import { AutoArchiveSetting } from "./AutoArchiveSetting";

interface ArchiveSettingsViewProps extends ArchiveActions {
  readonly projects: readonly ArchiveProject[];
  readonly activeDir: string | undefined;
  readonly chatCountByProject: Readonly<Record<string, number>>;
  readonly archivedChatsByProject: Readonly<
    Record<string, readonly ArchivedChat[]>
  >;
  readonly autoArchiveAfterDays: number | null;
  readonly chatsLoadState: ArchiveLoadState;
  readonly settingsLoadState: ArchiveLoadState;
}

function chatsLabel(count: number): string {
  return count === 1 ? "1 chat" : `${count} chats`;
}

function dialogCopy(pending: PendingDelete): {
  readonly title: string;
  readonly description: string;
} {
  if (pending.kind === "project") {
    return {
      title: `Delete "${pending.project.name}" from Weave?`,
      description: `Removes its ${chatsLabel(pending.chatCount)}, saved history and logs from Weave. The folder ${pending.project.dir} and its files are not touched. This can't be undone.`,
    };
  }
  return {
    title: `Delete "${pending.chat.title || UNTITLED_CHAT}"?`,
    description:
      "It's removed from Weave along with its saved history and summary. This can't be undone.",
  };
}

export function ArchiveSettingsView(props: ArchiveSettingsViewProps) {
  const {
    projects,
    activeDir,
    chatCountByProject,
    archivedChatsByProject,
    autoArchiveAfterDays,
  } = props;
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const archived = useMemo(() => archivedProjects(projects), [projects]);
  const groups = useMemo(
    () => groupArchivedChats(projects, archivedChatsByProject),
    [projects, archivedChatsByProject],
  );
  const copy = pending ? dialogCopy(pending) : null;

  const confirmDelete = () => {
    if (pending?.kind === "project") props.onDeleteProject(pending.project.dir);
    if (pending?.kind === "chat")
      props.onDeleteChat(pending.chat.id, pending.projectDir);
    setPending(null);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-10 py-12">
      <h1 className="text-2xl font-semibold text-white">Archive</h1>
      <SettingsSections>
        <SettingsSection
          title="Automatic archiving"
          contentClassName={ROUNDED_LIST_CLASS}
        >
          <AutoArchiveSetting
            afterDays={autoArchiveAfterDays}
            loadState={props.settingsLoadState}
            onChange={props.onSetAutoArchive}
          />
        </SettingsSection>
        <ArchivedProjectsSection
          projects={archived}
          activeDir={activeDir}
          onRestore={props.onRestoreProject}
          onDelete={(project) =>
            setPending({
              kind: "project",
              project,
              chatCount: chatCountByProject[project.dir] ?? 0,
            })
          }
        />
        <ArchivedChatsSection
          groups={groups}
          loadState={props.chatsLoadState}
          onRestore={props.onRestoreChat}
          onDelete={(chat, projectDir) =>
            setPending({ kind: "chat", chat, projectDir })
          }
        />
      </SettingsSections>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={copy?.title ?? ""}
        description={copy?.description ?? ""}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
