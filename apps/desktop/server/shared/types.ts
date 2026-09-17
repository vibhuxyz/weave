import type {
  ConversationMeta,
  GitStatus,
  GitChange,
  NormalizedPlugin,
  ActivePluginRef,
} from "@weave/core";
import type {
  CheckpointReason,
  EngineAuthMethod,
  EngineAuthOperation,
  SessionConfigOption,
  SessionUpdate,
  Usage,
} from "@weave/protocol";

export type { ConversationMeta, GitStatus, GitChange };

export interface PromptImageData {
  readonly data: string;
  readonly mimeType: string;
  readonly prompt?: string;
}

export type ClientMessage =
  | {
      readonly type: "prompt";
      readonly text: string;
      readonly persona?: string;
      readonly plugins?: readonly ActivePluginRef[];
      readonly images?: readonly PromptImageData[];
    }
  | { readonly type: "cancel" }
  | { readonly type: "set-config"; readonly configId: string; readonly value: string }
  | { readonly type: "git" }
  | { readonly type: "new-chat"; readonly instructions?: string }
  | { readonly type: "open-chat"; readonly sessionId: string }
  | { readonly type: "switch-engine"; readonly engineId: string }
  | {
      readonly type: "start-auth";
      readonly engineId: string;
      readonly methodId: string;
      readonly secret?: string;
    }
  | { readonly type: "cancel-auth" }
  | { readonly type: "list-files"; readonly query: string }
  | { readonly type: "read-attachment"; readonly path: string }
  | { readonly type: "refresh-engines" }
  | { readonly type: "refresh-plugins" };

export interface CheckpointStats {
  readonly filesModified: number;
  readonly commandsExecuted: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly notes: readonly string[];
}

export interface EngineEntry {
  readonly id: string;
  readonly label: string;
  readonly installed: boolean;
}

export type ServerMessage =
  | {
      readonly type: "ready";
      readonly sessionId: string;
      readonly cwd: string;
      readonly engineId: string;
      readonly engineLabel: string;
      readonly configOptions: readonly SessionConfigOption[];
      readonly resumed: boolean;
    }
  | {
      readonly type: "update";
      readonly update: SessionUpdate;
      readonly replay?: boolean;
      readonly source?: { readonly runId: string; readonly seq: number };
    }
  | { readonly type: "config-changed"; readonly configId: string; readonly value: string }
  | { readonly type: "config-rejected"; readonly configId: string; readonly message: string }
  | { readonly type: "git-status"; readonly git: GitStatus }
  | { readonly type: "attachment"; readonly path: string; readonly dataUri: string | null }
  | { readonly type: "turn-end"; readonly stopReason: string; readonly usage?: Usage | null }
  | { readonly type: "error"; readonly message: string }
  | {
      readonly type: "auth-required";
      readonly engineId: string;
      readonly engineLabel: string;
      readonly message: string;
      readonly methods: readonly EngineAuthMethod[];
    }
  | { readonly type: "auth-state"; readonly operation: EngineAuthOperation }
  | { readonly type: "engines"; readonly engines: readonly EngineEntry[] }
  | { readonly type: "plugin-catalog"; readonly plugins: readonly NormalizedPlugin[] }
  | { readonly type: "chats"; readonly chats: readonly ConversationMeta[]; readonly activeSessionId: string | null }
  | { readonly type: "files"; readonly query: string; readonly files: readonly string[] }
  | { readonly type: "reset" }
  | {
      readonly type: "checkpoint";
      readonly checkpointId: string;
      readonly reason: CheckpointReason;
      readonly summary: CheckpointStats;
    };

export interface AcpServerHandle {
  readonly port: number;
  close(): Promise<void>;
}
