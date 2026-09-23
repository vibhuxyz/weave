import type { ActiveAuthSession } from "../auth/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { PendingPermissions } from "../permissions/index.ts";
import type { ActiveSetup } from "../setup/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import type { HistoryStore } from "../history/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import type { Ledger, TasksStore, ConversationStore, SessionStore, NormalizedPlugin } from "@weave/core";
import type { AuthMethod } from "@weave/protocol";

export interface ClientMessageContext {
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly store: SessionStore;
  readonly tasksStore: TasksStore;
  readonly conversations: ConversationStore;
  readonly ledger: Ledger;
  readonly continuationTaskId: string;
  readonly ruleCatalog: string;
  readonly builtinSkillCatalog: string;
  readonly skillCatalog: string;
  readonly pluginsById: ReadonlyMap<string, NormalizedPlugin>;
  readonly authMethodsByEngine: Map<string, AuthMethod[]>;
  readonly pendingPermissions: PendingPermissions;
  readonly activeSetup: ActiveSetup;
  readonly compaction: CompactionController;
  readonly history: HistoryStore;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly sendEngineList: () => void;
  readonly loadPlugins: () => Promise<void>;
  readonly getAuthSession: () => ActiveAuthSession | null;
  readonly setAuthSession: (session: ActiveAuthSession | null) => void;
  readonly publishAuth: (patch: Partial<ActiveAuthSession["operation"]>) => void;
}
