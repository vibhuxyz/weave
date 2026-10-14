export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
}

export interface WeaveLocations {
  readonly home: string;
  readonly databasePath: string;
  readonly globalSkillsDir: string;
  readonly globalRulesDir: string;
}

export interface ProjectLocations {
  readonly dataDir: string;
  readonly logsDir: string;
  readonly skillDirs: readonly string[];
  readonly ruleDirs: readonly string[];
}

export interface SessionRecordInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly workingDir: string;
  readonly title: string;
  readonly engineId: string;
  readonly personaIds: readonly string[];
}

export interface ChatSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archivedAt: number | null;
}

export interface DecisionInput {
  readonly projectId: string;
  readonly question: string;
  readonly answer: string;
  readonly engineId: string;
}

export interface DecisionRecord {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly engineId: string;
  readonly createdAt: number;
}

export interface ThreadSeatRecord {
  readonly engineId: string;
  readonly engineSessionId: string;
  readonly syncedTurnSeq: number;
}

export interface ThreadTurnInput {
  readonly engineId: string;
  readonly userText: string;
  readonly answerText: string;
  readonly factsJson: string;
  readonly outcome: string;
}

export interface ThreadTurnRecord extends ThreadTurnInput {
  readonly seq: number;
}

export interface ThreadTurnPage {
  readonly turns: readonly ThreadTurnRecord[];
  readonly omittedCount: number;
}

export type StorageResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
