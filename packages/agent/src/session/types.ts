import type {
  AuthMethod,
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
  Usage,
} from "@weave/protocol";
import type { PermissionPolicy } from "../permissions/index.ts";

export interface SessionSink {
  onUpdate(update: SessionUpdate, replay: boolean): void;
  onPermission(
    toolCall: string,
    options: Array<{ optionId: string; name: string; kind: string }>,
    decision: { decision: "allow" | "reject"; optionId?: string; reason: string },
  ): void;
  onFileRead(path: string): void;
  onFileWritten(path: string, bytes: number): void;
  onSpawned(pid: number, entry: string): void;
  onSession(sessionId: string, resumed: boolean, options: SessionConfigOption[]): void;
  onCapabilities(capabilities: unknown): void;
}

export interface OpenSessionOptions {
  task: TaskContract;
  sink: SessionSink;
  policy?: PermissionPolicy;
  resumeSessionId?: string | null;
  engineId?: string;
  sandboxed?: boolean;
}

export type PromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface AgentSession {
  engineId: string;
  sessionId: string;
  resumed: boolean;
  configOptions: SessionConfigOption[];
  authMethods: AuthMethod[];
  authenticate(methodId: string): Promise<void>;
  prompt(
    blocks: PromptBlock[],
  ): Promise<{ stopReason: string; usage?: Usage | null }>;
  cancel(): Promise<void>;
  setConfigOption(configId: string, value: string): Promise<void>;
  newSession(): Promise<string>;
  resumeSession(id: string): Promise<boolean>;
  filesWritten(): string[];
  close(): void;
}
