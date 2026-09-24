import type { TasksStore, Ledger } from "@weave/core";
import type {
  AuthMethod,
  TaskContract,
} from "@weave/protocol";
import type { EngineAuthStates } from "../auth/index.ts";
import type { ProjectChats } from "../chat/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import type { HistoryStore, ReplayGate } from "../history/index.ts";
import type { PendingPermissions } from "../permissions/index.ts";
import type { PendingQuestions } from "../questions/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SessionContext {
  readonly projectDir: string;
  readonly dataDir: string;
  readonly task: TaskContract;
  readonly chats: ProjectChats;
  readonly tasksStore: TasksStore;
  readonly ledger: Ledger;
  readonly continuationTaskId: string;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly authMethodsByEngine: Map<string, AuthMethod[]>;
  readonly engineAuthStates: EngineAuthStates;
  readonly pendingPermissions: PendingPermissions;
  readonly pendingQuestions: PendingQuestions;
  readonly compaction: CompactionController;
  readonly history: HistoryStore;
  readonly replayGate: ReplayGate;
}
