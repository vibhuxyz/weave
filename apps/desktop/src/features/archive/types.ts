export type ArchiveLoadState = "offline" | "loading" | "ready";

export interface ArchiveProject {
  readonly dir: string;
  readonly name: string;
  readonly tint?: string;
  readonly archivedAt?: string;
}

export interface ArchivedChat {
  readonly id: string;
  readonly title: string;
  readonly archivedAt: number | null;
}

export interface ArchivedChatGroup {
  readonly project: ArchiveProject;
  readonly chats: readonly ArchivedChat[];
}

export type PendingDelete =
  | { readonly kind: "project"; readonly project: ArchiveProject; readonly chatCount: number }
  | { readonly kind: "chat"; readonly chat: ArchivedChat; readonly projectDir: string };

export interface ArchiveActions {
  readonly onSetAutoArchive: (afterDays: number | null) => void;
  readonly onRestoreProject: (dir: string) => void;
  readonly onDeleteProject: (dir: string) => void;
  readonly onRestoreChat: (sessionId: string, projectDir: string) => void;
  readonly onDeleteChat: (sessionId: string, projectDir: string) => void;
}
