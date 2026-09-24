import type { ConsentLink, SessionModes, TerminalKeyName } from "@weave/agent";
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
import type { QuestionField, QuestionNotice } from "./question-types.ts";
import type { RunOutcome, RunUpdate } from "./run-types.ts";

export type { ConversationMeta, GitStatus, GitChange };

export interface PromptImageData {
  readonly data: string;
  readonly mimeType: string;
  readonly prompt?: string;
}

/** What the setup panel should show for an engine's consent page. */
export type SetupConsent =
  | {
      readonly kind: "card";
      readonly title: string | null;
      readonly notice: string | null;
      readonly agreement: string;
      readonly checked: boolean;
      readonly links: readonly ConsentLink[];
    }
  | { readonly kind: "applying" }
  | { readonly kind: "manual"; readonly reason: string };

export interface PermissionOption {
  readonly optionId: string;
  readonly name: string;
  readonly kind: string;
}

export type ClientMessage =
  | {
      readonly type: "prompt";
      readonly text: string;
      readonly promptId?: string;
      readonly autoCompactThreshold?: number;
      readonly persona?: string;
      readonly personaIds?: readonly string[];
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
  | { readonly type: "set-mode"; readonly modeId: string }
  | { readonly type: "start-setup"; readonly engineId: string }
  | { readonly type: "cancel-setup" }
  | { readonly type: "submit-setup-key"; readonly key: TerminalKeyName }
  | { readonly type: "submit-setup-consent"; readonly agreed: boolean }
  | { readonly type: "cancel-auth" }
  | { readonly type: "submit-auth-input"; readonly text: string }
  | { readonly type: "list-files"; readonly query: string }
  | { readonly type: "read-attachment"; readonly path: string }
  | { readonly type: "refresh-engines" }
  | {
      readonly type: "permission-response";
      readonly requestId: string;
      /** `null` rejects: the user declined, or closed the card. */
      readonly optionId: string | null;
    }
  | {
      readonly type: "question-response";
      readonly requestId: string;
      readonly answers: Readonly<Record<string, unknown>> | null;
    }
  | { readonly type: "refresh-plugins" }
  | { readonly type: "compact"; readonly operationId: string }
  | { readonly type: "list-project-chats"; readonly projectDirs: readonly string[] }
  | { readonly type: "delete-chat"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "archive-chat"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "restore-chat"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "delete-project"; readonly projectDir: string }
  | { readonly type: "set-auto-archive"; readonly afterDays: number | null }
  | { readonly type: "start-run"; readonly request: string }
  | { readonly type: "cancel-run" }
  | {
      readonly type: "save-history";
      readonly sessionId: string;
      readonly turns: readonly unknown[];
      readonly droppedTurnCount: number;
    };

export interface CheckpointStats {
  readonly filesModified: number;
  readonly commandsExecuted: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly notes: readonly string[];
}

export type EngineAuthState = "unknown" | "authenticated" | "auth_required";

export interface EngineEntry {
  readonly id: string;
  readonly label: string;
  readonly installed: boolean;
  readonly authState: EngineAuthState;
}

export interface ArchivedChatMeta extends ConversationMeta {
  readonly archivedAt: number | null;
}

export interface ContextSnapshot {
  readonly contextTokens: number;
  readonly contextLimit: number;
}

export type CompactionTrigger = "manual" | "automatic";

interface CompactionEventBase {
  readonly type: "compaction";
  readonly operationId: string;
  readonly sessionId: string;
  readonly trigger: CompactionTrigger;
}

export type CompactionEvent =
  | (CompactionEventBase & {
      readonly status: "started";
      readonly promptId: string | null;
      readonly contextBefore: ContextSnapshot | null;
    })
  | (CompactionEventBase & {
      readonly status: "completed";
      readonly contextAfter: ContextSnapshot | null;
      readonly summary: string | null;
    })
  | (CompactionEventBase & { readonly status: "failed"; readonly reason: string })
  | (CompactionEventBase & { readonly status: "cancelled" });

export type ServerMessage =
  | CompactionEvent
  | { readonly type: "run-started"; readonly runKey: string; readonly request: string }
  | { readonly type: "run-update"; readonly runKey: string; readonly update: RunUpdate }
  | { readonly type: "run-finished"; readonly runKey: string; readonly outcome: RunOutcome }
  | { readonly type: "prompt-withdrawn"; readonly promptId: string }
  | {
      readonly type: "history-archive";
      readonly sessionId: string;
      readonly turns: readonly unknown[];
      readonly droppedTurnCount: number;
    }
  | { readonly type: "compaction-summary"; readonly sessionId: string; readonly summary: string }
  | { readonly type: "session-capabilities"; readonly sessionId: string; readonly supportsCompaction: boolean }
  | {
      readonly type: "ready";
      readonly sessionId: string;
      readonly cwd: string;
      readonly engineId: string;
      readonly engineLabel: string;
      readonly configOptions: readonly SessionConfigOption[];
      readonly modes: SessionModes | null;
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
      readonly type: "permission-request";
      readonly requestId: string;
      readonly toolCallId: string | null;
      readonly title: string;
      readonly kind: string;
      /** The shell command, when the tool call carries one. */
      readonly command: string | null;
      /** The agent's own choices, in the order it offered them. */
      readonly options: readonly PermissionOption[];
    }
  | { readonly type: "permission-cancelled"; readonly requestId: string }
  | {
      readonly type: "question-request";
      readonly requestId: string;
      readonly message: string;
      readonly fields: readonly QuestionField[];
      readonly notices: readonly QuestionNotice[];
    }
  | { readonly type: "question-invalid"; readonly requestId: string; readonly message: string }
  | { readonly type: "question-closed"; readonly requestId: string }
  | { readonly type: "modes"; readonly modes: SessionModes | null }
  | {
      readonly type: "policy-block";
      readonly toolCallId: string;
      readonly title: string;
      readonly reason: string;
    }
  | {
      readonly type: "setup-required";
      readonly engineId: string;
      readonly engineLabel: string;
      readonly description: string;
    }
  | {
      readonly type: "setup-state";
      readonly engineId: string;
      readonly status: "running" | "succeeded" | "failed";
      readonly error: string | null;
    }
  | {
      readonly type: "setup-consent";
      readonly engineId: string;
      readonly consent: SetupConsent;
    }
  | {
      readonly type: "setup-output";
      readonly engineId: string;
      readonly lines: readonly string[];
    }
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
  | { readonly type: "chat-deleted"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "chat-archived"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "chat-restored"; readonly sessionId: string; readonly projectDir: string }
  | { readonly type: "project-deleted"; readonly projectDir: string; readonly removedChatCount: number }
  | { readonly type: "archive-settings"; readonly autoArchiveAfterDays: number | null }
  | {
      readonly type: "project-chats";
      readonly chatsByProject: Readonly<Record<string, readonly ConversationMeta[]>>;
      readonly archivedChatsByProject: Readonly<Record<string, readonly ArchivedChatMeta[]>>;
    }
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
