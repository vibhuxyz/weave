import type {
  TasksStore,
  SessionStore,
  Ledger,
} from "@weave/core";
import type {
  AuthMethod,
  TaskContract,
} from "@weave/protocol";
import type { ServerMessage } from "./server.types.ts";

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
}
