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

export type ClientMessage =
  | {
      type: "prompt";
      text: string;
      persona?: string;
      plugins?: ActivePluginRef[];
      images?: { data: string; mimeType: string; prompt?: string }[];
    }
  | { type: "cancel" }
  | { type: "set-config"; configId: string; value: string }
  | { type: "git" }
  | { type: "new-chat"; instructions?: string }
  | { type: "open-chat"; sessionId: string }
  | { type: "switch-engine"; engineId: string }
  | { type: "start-auth"; engineId: string; methodId: string; secret?: string }
  | { type: "cancel-auth" }
  | { type: "list-files"; query: string }
  | { type: "read-attachment"; path: string }
  | { type: "refresh-engines" }
  | { type: "refresh-plugins" };

export type ServerMessage =
  | {
      type: "ready";
      sessionId: string;
      cwd: string;
      engineId: string;
      engineLabel: string;
      configOptions: SessionConfigOption[];
      resumed: boolean;
    }
  | {
      type: "update";
      update: SessionUpdate;
      replay?: boolean;
      source?: { runId: string; seq: number };
    }
  | { type: "config-changed"; configId: string; value: string }
  | { type: "config-rejected"; configId: string; message: string }
  | { type: "git-status"; git: GitStatus }
  | { type: "attachment"; path: string; dataUri: string | null }
  | { type: "turn-end"; stopReason: string; usage?: Usage | null }
  | { type: "error"; message: string }
  | {
      type: "auth-required";
      engineId: string;
      engineLabel: string;
      message: string;
      methods: EngineAuthMethod[];
    }
  | { type: "auth-state"; operation: EngineAuthOperation }
  | {
      type: "engines";
      engines: { id: string; label: string; installed: boolean }[];
    }
  | { type: "plugin-catalog"; plugins: NormalizedPlugin[] }
  | { type: "chats"; chats: ConversationMeta[]; activeSessionId: string | null }
  | { type: "files"; query: string; files: string[] }
  | { type: "reset" }
  | {
      type: "checkpoint";
      checkpointId: string;
      reason: CheckpointReason;
      summary: {
        filesModified: number;
        commandsExecuted: number;
        testsPassed: number;
        testsFailed: number;
        notes: string[];
      };
    };

export interface AcpServerHandle {
  port: number;
  close(): Promise<void>;
}
