import type {
  ChatSummary,
  ProjectRecord,
  ProjectsRepo,
  SessionsRepo,
  StorageResult,
  ThreadSeatRecord,
  ThreadsRepo,
  ThreadTurnInput,
  ThreadTurnPage,
} from "../storage/index.ts";

export interface ProjectChatsOptions {
  readonly project: ProjectRecord;
  readonly workingDir: string;
  readonly sessions: SessionsRepo;
  readonly projects: ProjectsRepo;
  readonly threads: ThreadsRepo;
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

  seat(threadId: string, engineId: string): ThreadSeatRecord | null {
    return this.options.threads.seat(threadId, engineId);
  }

  seatCount(threadId: string): number {
    return this.options.threads.seatCount(threadId);
  }

  saveSeat(threadId: string, seat: ThreadSeatRecord): StorageResult<null> {
    return this.options.threads.upsertSeat(threadId, this.projectId, seat, this.options.now());
  }

  appendTurn(threadId: string, turn: ThreadTurnInput): StorageResult<number> {
    return this.options.threads.appendTurn(threadId, this.projectId, turn, this.options.now());
  }

  turnsSince(threadId: string, afterSeq: number, limit: number): ThreadTurnPage {
    return this.options.threads.turnsSince(threadId, afterSeq, limit);
  }

  engineOf(threadId: string): string | null {
    return this.options.threads.engineOf(threadId);
  }
}
