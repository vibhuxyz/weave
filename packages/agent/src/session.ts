import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
  AuthMethod,
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
  Usage,
} from "@weave/protocol";
import { isAuthRequiredError } from "@weave/protocol";
import { spawnAgent, type SpawnedAgent } from "./spawn.ts";
import { resolveCodexCliEntry } from "./engines.ts";
import {
  confineToTaskDir,
  isInside,
  isPlanModeExit,
  relativeInside,
  toAcpResponse,
  type PermissionPolicy,
} from "./permissions.ts";
import { firstMatch } from "./globs.ts";

/** Everything the session emits. The runner turns these into ledger events. */
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
}

export interface OpenSessionOptions {
  task: TaskContract;
  sink: SessionSink;
  policy?: PermissionPolicy;
  /** Try to resume this session id before creating a new one. */
  resumeSessionId?: string | null;
  /** Which ACP engine to run. Defaults to Claude Code. */
  engineId?: string;
  /** Enforce OS and engine sandboxing restrictions. */
  sandboxed?: boolean;
}

/**
 * `session/new` was refused until the user signs in.
 *
 * Carries the methods the engine advertised at `initialize`, so the caller can
 * offer an action instead of relaying a dead-end string. Weave used to drop
 * `authMethods` on the floor and surface only `error.message`, which is why
 * "Could not switch engine: Authentication required…" had nothing to click.
 */
export class AuthRequiredError extends Error {
  readonly engineId: string;
  readonly authMethods: AuthMethod[];

  constructor(engineId: string, authMethods: AuthMethod[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "AuthRequiredError";
    this.engineId = engineId;
    this.authMethods = authMethods;
  }
}

/** One piece of a prompt: text, or an image the agent should look at. */
export type PromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface AgentSession {
  /** Which engine is on the other end. */
  engineId: string;
  sessionId: string;
  resumed: boolean;
  configOptions: SessionConfigOption[];
  /** What the engine advertised at `initialize`. Empty when it needs no auth. */
  authMethods: AuthMethod[];
  /**
   * Tell the engine a method was satisfied.
   *
   * Enough on its own only for agent-handled methods. A `terminal` method
   * needs its command run first — see `runTerminalAuth`.
   */
  authenticate(methodId: string): Promise<void>;
  prompt(
    blocks: PromptBlock[],
  ): Promise<{ stopReason: string; usage?: Usage | null }>;
  cancel(): Promise<void>;
  setConfigOption(configId: string, value: string): Promise<void>;
  newSession(): Promise<string>;
  /**
   * Switch this live connection to an existing session id and replay its
   * transcript. Returns false when the agent cannot load it (unsupported, or
   * the id is gone) — the caller keeps the current session in that case.
   */
  resumeSession(id: string): Promise<boolean>;
  filesWritten(): string[];
  close(): void;
}

class SessionClient implements acp.Client {
  readonly task: TaskContract;
  readonly sink: SessionSink;
  readonly policy: PermissionPolicy;
  readonly written = new Set<string>();
  replaying = false;

  constructor(task: TaskContract, sink: SessionSink, policy: PermissionPolicy) {
    this.task = task;
    this.sink = sink;
    this.policy = policy;
  }

  /**
   * Confine every file operation to the task directory, and every WRITE to
   * the part of it that is not read-only.
   *
   * This is the second of the two confinement boundaries, and it covers what
   * the permission policy cannot: ACP-routed `readTextFile`/`writeTextFile`
   * never produce a permission request at all. The policy covers the agent's
   * own tools. Neither one alone is sufficient.
   */
  private safeResolve(requestedPath: string, mode: "read" | "write"): string {
    const absolute = isAbsolute(requestedPath)
      ? requestedPath
      : resolve(this.task.cwd, requestedPath);
    if (!isInside(this.task.cwd, absolute)) {
      throw new Error(`Refused path outside the task dir: ${requestedPath}`);
    }

    if (mode === "write" && this.task.readOnlyPaths?.length) {
      const rel = relativeInside(this.task.cwd, absolute);
      const pattern = rel === null ? null : firstMatch(this.task.readOnlyPaths, rel);
      if (pattern) {
        throw new Error(
          `Refused write to read-only path: ${rel} (matches "${pattern}")`,
        );
      }
    }
    return absolute;
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const decision = await Promise.resolve(this.policy(this.task, params));

    // The plan text only exists on the ExitPlanMode permission request — the
    // engine never emits it as a normal tool call. Surface it as one so the
    // client's approval modal has something to show.
    if (isPlanModeExit(params)) {
      const raw = params.toolCall.rawInput as Record<string, unknown> | undefined;
      const planText =
        typeof raw?.plan === "string"
          ? raw.plan
          : typeof raw?.content === "string"
            ? raw.content
            : null;
      if (planText) {
        this.sink.onUpdate(
          {
            sessionUpdate: "tool_call",
            toolCallId: params.toolCall.toolCallId ?? "exit-plan-mode",
            title: "Approve Plan",
            kind: "other",
            status: "failed",
            rawInput: { plan: planText },
            content: [
              { type: "content", content: { type: "text", text: planText } },
            ],
          } as SessionUpdate,
          this.replaying,
        );
      }
    }


    // On a permission request `toolCall` is a ToolCallUpdate: every field is
    // optional. Fall back to the id so the ledger always has a handle.
    this.sink.onPermission(
      params.toolCall.title ?? params.toolCall.toolCallId ?? "tool call",
      params.options.map((option) => ({
        optionId: option.optionId,
        name: option.name,
        kind: option.kind,
      })),
      decision.decision === "allow"
        ? { decision: "allow", optionId: decision.optionId, reason: decision.reason }
        : { decision: "reject", reason: decision.reason },
    );
    return toAcpResponse(decision);
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    this.sink.onUpdate(params.update, this.replaying);
  }

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    const path = this.safeResolve(params.path, "read");
    const text = await readFile(path, "utf8");
    this.sink.onFileRead(path);

    // `line` is 1-based; `limit` counts lines from there.
    if (params.line == null && params.limit == null) return { content: text };
    const lines = text.split("\n");
    const start = Math.max(0, (params.line ?? 1) - 1);
    const end = params.limit == null ? undefined : start + params.limit;
    return { content: lines.slice(start, end).join("\n") };
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    const path = this.safeResolve(params.path, "write");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, params.content, "utf8");
    this.written.add(path);
    this.sink.onFileWritten(path, Buffer.byteLength(params.content));
    return {};
  }
}

/**
 * Spawn an agent and open a session against `task.cwd`.
 *
 * Resumes `resumeSessionId` when the agent supports it and the id still
 * exists; falls back to a new session otherwise, which is always safe.
 */
export async function openSession(
  options: OpenSessionOptions,
): Promise<AgentSession> {
  const { task, sink } = options;
  const policy = options.policy ?? confineToTaskDir;

  const isSandboxed = options.sandboxed ?? options.task.sandboxed ?? false;
  const spawned: SpawnedAgent = spawnAgent(task.cwd, options.engineId, {
    sandboxed: isSandboxed,
  });
  sink.onSpawned(spawned.child.pid ?? -1, spawned.entry);

  const client = new SessionClient(task, sink, policy);
  const stream = acp.ndJsonStream(
    Writable.toWeb(spawned.child.stdin!) as WritableStream<Uint8Array>,
    Readable.toWeb(spawned.child.stdout!) as ReadableStream<Uint8Array>,
  );
  const connection = new acp.ClientSideConnection(() => client, stream);

  const init = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      // Without these the agent can read and suggest, but never apply a fix.
      fs: { readTextFile: true, writeTextFile: true },
      auth: { terminal: true },
      elicitation: { url: {} },
      _meta: { "terminal-auth": true },
    },
  });

  let sessionId = "";
  let configOptions: SessionConfigOption[] = [];
  let resumed = false;
  const canLoadSession = init.agentCapabilities?.loadSession === true;
  // Kept, not discarded: this is the only place the engine says how to sign
  // in, and the caller needs it the moment `session/new` refuses.
  const authMethods: AuthMethod[] = init.authMethods ?? [];

  if (canLoadSession && options.resumeSessionId) {
    try {
      client.replaying = true;
      const loaded = await connection.loadSession({
        sessionId: options.resumeSessionId,
        cwd: task.cwd,
        mcpServers: [],
      });
      sessionId = options.resumeSessionId;
      configOptions = loaded.configOptions ?? [];
      resumed = true;
    } catch {
      // A remembered session can be gone (never had a turn, deleted, another
      // machine). Starting fresh is always safe.
    } finally {
      client.replaying = false;
    }
  }

  if (!resumed) {
    try {
      const created = await connection.newSession({
        cwd: task.cwd,
        mcpServers: [],
      });
      sessionId = created.sessionId;
      configOptions = created.configOptions ?? [];
    } catch (error) {
      // Kill the child before rethrowing: an engine that refuses every session
      // would otherwise leak one process per switch attempt.
      if (isAuthRequiredError(error)) {
        spawned.stop();
        let methods =
          (error as { data?: { authMethods?: AuthMethod[] } })?.data
            ?.authMethods ?? authMethods;
        if (methods.length === 0 && (spawned.engine.id === "agy" || spawned.engine.id === "antigravity")) {
          methods = [
            {
              id: "agy-login",
              name: "Sign in with Google Antigravity",
              type: "terminal",
              _meta: {
                "terminal-auth": {
                  command: "agy",
                  args: ["auth", "login"],
                },
              },
            } as unknown as AuthMethod,
          ];
        } else if (methods.length === 0 && spawned.engine.id === "claude-code") {
          methods = [
            {
              id: "claude-ai-login",
              name: "Claude Subscription",
              type: "terminal",
              description: "Use Claude subscription",
              args: ["--cli", "auth", "login", "--claudeai"],
            } as unknown as AuthMethod,
            {
              id: "console-login",
              name: "Anthropic Console",
              type: "terminal",
              description: "Use Anthropic Console (API usage billing)",
              args: ["--cli", "auth", "login", "--console"],
            } as unknown as AuthMethod,
          ];
        } else if (spawned.engine.id === "codex") {
          const codexCli = resolveCodexCliEntry(spawned.engine);
          const isNative = !codexCli.endsWith(".js");
          const cmd = isNative ? codexCli : process.execPath;
          const baseArgs = isNative ? [] : [codexCli];
          methods = [
            {
              id: "chat-gpt-device-code",
              name: "Sign in with Device Code",
              type: "terminal",
              description: "Sign in using one-time verification code (recommended)",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--device-auth"],
                  label: "ChatGPT Device Auth",
                },
              },
            } as unknown as AuthMethod,
            {
              id: "chat-gpt",
              name: "Sign in with Browser",
              type: "terminal",
              description: "Sign in using your OpenAI ChatGPT account in browser",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login"],
                  label: "ChatGPT Login",
                },
              },
            } as unknown as AuthMethod,
            {
              id: "api-key",
              name: "OpenAI API Key",
              type: "terminal",
              description: "Authenticate using an OpenAI API Key",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--with-api-key"],
                  label: "OpenAI API Key Login",
                },
              },
            } as unknown as AuthMethod,
          ];
        }
        throw new AuthRequiredError(spawned.engine.id, methods, error);
      }
      throw error;
    }
  }

  sink.onSession(sessionId, resumed, configOptions);

  return {
    engineId: spawned.engine.id,
    // Getters: `newSession()` / `resumeSession()` reassign the closure vars,
    // and callers (the server's session store) must see the current values,
    // not the snapshot taken when this object was built.
    get sessionId() {
      return sessionId;
    },
    get resumed() {
      return resumed;
    },
    get configOptions() {
      return configOptions;
    },
    get authMethods() {
      return authMethods;
    },
    async authenticate(methodId: string) {
      await connection.authenticate({ methodId });
    },
    async prompt(blocks: PromptBlock[]) {
      const result = await connection.prompt({
        sessionId,
        prompt: blocks,
      });
      return { stopReason: result.stopReason, usage: result.usage };
    },
    async cancel() {
      await connection.cancel({ sessionId });
    },
    async setConfigOption(configId: string, value: string) {
      await connection.setSessionConfigOption({ sessionId, configId, value });
    },
    async newSession() {
      try {
        const created = await connection.newSession({
          cwd: task.cwd,
          mcpServers: [],
        });
        sessionId = created.sessionId;
        resumed = false;
        return sessionId;
      } catch (error) {
        if (isAuthRequiredError(error)) {
          let methods =
            (error as { data?: { authMethods?: AuthMethod[] } })?.data
              ?.authMethods ?? authMethods;
          if (methods.length === 0 && (spawned.engine.id === "agy" || spawned.engine.id === "antigravity")) {
            methods = [
              {
                id: "agy-login",
                name: "Sign in with Google Antigravity",
                type: "terminal",
                _meta: {
                  "terminal-auth": {
                    command: "agy",
                    args: ["auth", "login"],
                  },
                },
              } as unknown as AuthMethod,
            ];
          } else if (methods.length === 0 && spawned.engine.id === "claude-code") {
            methods = [
              {
                id: "claude-ai-login",
                name: "Claude Subscription",
                type: "terminal",
                description: "Use Claude subscription",
                args: ["--cli", "auth", "login", "--claudeai"],
              } as unknown as AuthMethod,
              {
                id: "console-login",
                name: "Anthropic Console",
                type: "terminal",
                description: "Use Anthropic Console (API usage billing)",
                args: ["--cli", "auth", "login", "--console"],
              } as unknown as AuthMethod,
            ];
          }
          throw new AuthRequiredError(spawned.engine.id, methods, error);
        }
        throw error;
      }
    },
    async resumeSession(id: string) {
      if (!canLoadSession) return false;
      try {
        client.replaying = true;
        const loaded = await connection.loadSession({
          sessionId: id,
          cwd: task.cwd,
          mcpServers: [],
        });
        sessionId = id;
        configOptions = loaded.configOptions ?? configOptions;
        resumed = true;
        return true;
      } catch {
        return false;
      } finally {
        client.replaying = false;
      }
    },
    filesWritten: () => [...client.written],
    close() {
      // Cancel first: closing stdin under a live query makes the engine dump
      // its own teardown stack ("Query closed before response received") to
      // stderr, which we inherit. Cancelling lets it wind down quietly.
      void connection
        .cancel({ sessionId })
        .catch(() => {})
        .finally(() => spawned.stop());
    },
  };
}
