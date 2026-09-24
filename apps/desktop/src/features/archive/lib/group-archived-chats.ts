import type { ArchiveProject, ArchivedChat, ArchivedChatGroup } from "../types";

function newestFirst(left: ArchivedChat, right: ArchivedChat): number {
  return (right.archivedAt ?? 0) - (left.archivedAt ?? 0) || left.id.localeCompare(right.id);
}

export function groupArchivedChats(
  projects: readonly ArchiveProject[],
  archivedChatsByProject: Readonly<Record<string, readonly ArchivedChat[]>>,
): readonly ArchivedChatGroup[] {
  return projects
    .map((project) => ({ project, chats: [...(archivedChatsByProject[project.dir] ?? [])].sort(newestFirst) }))
    .filter((group) => group.chats.length > 0)
    .sort((left, right) => left.project.name.localeCompare(right.project.name) || left.project.dir.localeCompare(right.project.dir));
}

export function archivedProjects(projects: readonly ArchiveProject[]): readonly ArchiveProject[] {
  return projects
    .filter((project) => project.archivedAt !== undefined)
    .sort((left, right) => (right.archivedAt ?? "").localeCompare(left.archivedAt ?? "") || left.dir.localeCompare(right.dir));
}
