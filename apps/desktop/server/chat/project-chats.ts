import type { ChatSummary, ProjectRecord, ProjectsRepo, SessionsRepo, StorageResult } from "../storage/index.ts";

export interface ProjectChatsOptions {
  readonly project: ProjectRecord;
  readonly workingDir: string;
  readonly sessions: SessionsRepo;
  readonly projects: ProjectsRepo;
  readonly now: () => number;
}

export interface ChatDetails {
  readonly title: string;
  readonly engineId: string;
  readonly personaIds: readonly string[];
}

export function parsePersonaIds(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

export class ProjectChats {
  private readonly options: ProjectChatsOptions;

  constructor(options: ProjectChatsOptions) {
    this.options = options;
  }

  get projectId(): string {
    return this.options.project.id;
  }

  list(): readonly ChatSummary[] {
    return this.options.sessions.listForProject(this.projectId);
  }

  has(sessionId: string): boolean {
    return this.options.sessions.belongsToProject(sessionId, this.projectId);
  }

  record(sessionId: string, details: ChatDetails): StorageResult<null> {
    return this.options.sessions.record(
      { sessionId, projectId: this.projectId, workingDir: this.options.workingDir, ...details },
      this.options.now(),
    );
  }

  lastSessionId(): string | null {
    return this.options.projects.lastSessionId(this.projectId);
  }

  rememberLastSession(sessionId: string): boolean {
    return this.options.projects.setLastSessionId(this.projectId, sessionId, this.options.now());
  }
}
