import { resolve } from "node:path";
import { canonicalProjectPath } from "../storage/index.ts";
import type { ChatSummary, ProjectRecord, ProjectsRepo, SessionsRepo, StorageResult } from "../storage/index.ts";

export const MAX_LISTED_PROJECTS = 64;
const MAX_PROJECT_DIR_CHARS = 4096;

export interface ProjectChatListing {
  readonly chatsByProject: Readonly<Record<string, readonly ChatSummary[]>>;
  readonly archivedChatsByProject: Readonly<Record<string, readonly ChatSummary[]>>;
}

export interface DeletedProject {
  readonly projectId: string;
  readonly removedChatCount: number;
}

export function isProjectDir(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PROJECT_DIR_CHARS;
}

export function parseProjectDirs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isProjectDir))].sort().slice(0, MAX_LISTED_PROJECTS);
}

export class ChatDirectory {
  private readonly projects: ProjectsRepo;
  private readonly sessions: SessionsRepo;

  constructor(projects: ProjectsRepo, sessions: SessionsRepo) {
    this.projects = projects;
    this.sessions = sessions;
  }

  async projectForFolder(projectDir: string): Promise<ProjectRecord | null> {
    const canonical = await canonicalProjectPath(projectDir);
    return this.projects.findByRootPath(canonical.ok ? canonical.value : resolve(projectDir));
  }

  async setChatArchived(projectDir: string, sessionId: string, archivedAtMs: number | null): Promise<StorageResult<null>> {
    const project = await this.projectForFolder(projectDir);
    if (!project) return { ok: false, reason: `No chats are saved for ${projectDir}` };
    return this.sessions.setArchived(sessionId, project.id, archivedAtMs);
  }

  async deleteChat(projectDir: string, sessionId: string): Promise<StorageResult<null>> {
    const project = await this.projectForFolder(projectDir);
    if (!project) return { ok: false, reason: `No chats are saved for ${projectDir}` };
    return this.sessions.delete(sessionId, project.id);
  }

  async deleteProject(projectDir: string): Promise<DeletedProject | null> {
    const project = await this.projectForFolder(projectDir);
    if (!project) return null;
    const removedChatCount = this.sessions.countForProject(project.id);
    this.projects.delete(project.id);
    return { projectId: project.id, removedChatCount };
  }

  async listForFolders(dirs: readonly string[]): Promise<ProjectChatListing> {
    const resolved = await Promise.all(dirs.map(async (dir) => ({ dir, project: await this.projectForFolder(dir) })));
    const chatsByProject: Record<string, readonly ChatSummary[]> = {};
    const archivedChatsByProject: Record<string, readonly ChatSummary[]> = {};
    for (const { dir, project } of resolved) {
      chatsByProject[dir] = project ? this.sessions.listForProject(project.id) : [];
      archivedChatsByProject[dir] = project ? this.sessions.listArchivedForProject(project.id) : [];
    }
    return { chatsByProject, archivedChatsByProject };
  }
}
