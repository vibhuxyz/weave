import type {
  AuthMethod,
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
  Usage,
} from "@weave/protocol";
import type { PermissionPolicy } from "../permissions/index.ts";
import type { SessionModes } from "./modes.ts";

export interface PromptOptions {
  readonly stallTimeoutMs?: number;
}

export interface SessionSink {
  onUpdate(update: SessionUpdate, replay: boolean, sessionId?: string): void;
  onPermission(
    toolCall: string,
    options: Array<{ optionId: string; name: string; kind: string }>,
    decision: { decision: "allow" | "reject"; optionId?: string; reason: string },
  ): void;
  /** A tool the policy refused without ever asking the user. */
  onPolicyBlock?(block: {
    toolCallId: string;
    title: string;
    reason: string;
  }): void;
  onFileRead(path: string): void;
  onFileWritten(path: string, bytes: number): void;
  onSpawned(pid: number, entry: string): void;
  onSession(
    sessionId: string,
    resumed: boolean,
    options: SessionConfigOption[],
    modes: SessionModes | null,
  ): void;
  onCapabilities(capabilities: unknown): void;
}

export interface OpenSessionOptions {
  task: TaskContract;
  sink: SessionSink;
  policy?: PermissionPolicy;
  resumeSessionId?: string | null;
  engineId?: string;
  sandboxed?: boolean;
  /** Silence allowed during a turn before the engine is killed. 0 disables. */
  stallTimeoutMs?: number;
}

export type PromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface AgentSession {
  engineId: string;
  sessionId: string;
  resumed: boolean;
  configOptions: SessionConfigOption[];
  /** The agent's operating modes (plan, accept-edits, …), or null if it has none. */
  readonly modes: SessionModes | null;
  authMethods: AuthMethod[];
  authenticate(methodId: string): Promise<void>;
  prompt(
    blocks: PromptBlock[],
    options?: PromptOptions,
  ): Promise<{ stopReason: string; usage?: Usage | null }>;
  cancel(): Promise<void>;
  setConfigOption(configId: string, value: string): Promise<void>;
  setMode(modeId: string): Promise<void>;
  newSession(): Promise<string>;
  resumeSession(id: string): Promise<boolean>;
  filesWritten(): string[];
  /** False once the engine process has been stopped and cannot serve a turn. */
  readonly alive: boolean;
  close(): void;
}
