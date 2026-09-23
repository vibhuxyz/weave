import type {
  TasksStore,
  SessionStore,
  Ledger,
} from "@weave/core";
import type {
  AuthMethod,
  TaskContract,
} from "@weave/protocol";
import type { EngineAuthStates } from "../auth/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import type { HistoryStore, ReplayGate } from "../history/index.ts";
import type { PendingPermissions } from "../permissions/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SessionContext {
  readonly projectDir: string;
  readonly task: TaskContract;
  readonly store: SessionStore;
  readonly tasksStore: TasksStore;
  readonly ledger: Ledger;
  readonly continuationTaskId: string;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly authMethodsByEngine: Map<string, AuthMethod[]>;
  readonly engineAuthStates: EngineAuthStates;
  readonly pendingPermissions: PendingPermissions;
  readonly compaction: CompactionController;
  readonly history: HistoryStore;
  readonly replayGate: ReplayGate;
}
