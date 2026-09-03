import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
} from "@weave/protocol";
import { spawnAgent, type SpawnedAgent } from "./spawn.ts";
import {
  confineToTaskDir,
  isInside,
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
}

export interface AgentSession {
  /** Which engine is on the other end. */
  engineId: string;
  sessionId: string;
  resumed: boolean;
  configOptions: SessionConfigOption[];
  prompt(text: string): Promise<{ stopReason: string }>;
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
    const decision = this.policy(this.task, params);
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

  const spawned: SpawnedAgent = spawnAgent(task.cwd, options.engineId);
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
    },
  });

  let sessionId = "";
  let configOptions: SessionConfigOption[] = [];
  let resumed = false;
  const canLoadSession = init.agentCapabilities?.loadSession === true;

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
    const created = await connection.newSession({
      cwd: task.cwd,
      mcpServers: [],
    });
    sessionId = created.sessionId;
    configOptions = created.configOptions ?? [];
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
    async prompt(text: string) {
      const result = await connection.prompt({
        sessionId,
        prompt: [{ type: "text", text }],
      });
      return { stopReason: result.stopReason };
    },
    async cancel() {
      await connection.cancel({ sessionId });
    },
    async setConfigOption(configId: string, value: string) {
      await connection.setSessionConfigOption({ sessionId, configId, value });
    },
    async newSession() {
      const created = await connection.newSession({
        cwd: task.cwd,
        mcpServers: [],
      });
      sessionId = created.sessionId;
      resumed = false;
      return sessionId;
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
