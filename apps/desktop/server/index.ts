/**
 * WebSocket adapter over @weave/agent + @weave/core.
 *
 * This file used to be the whole system (528 lines). It is now transport: it
 * owns no spawn logic, no permission decisions, and no file I/O. All of that
 * moved to packages/ so it can run headless — from the CLI, and from the eval
 * harness, neither of which may depend on a window.
 *
 * The desktop holds a LONG-LIVED session (many prompts, streaming, cancel),
 * which is why it drives `openSession` directly rather than core's one-shot
 * `runTask`. Both write the same ledger.
 *
 * Run standalone:  PROJECT_DIR=/path/to/repo pnpm -F desktop server
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  confineToTaskDir,
  isInside,
  createEngineSupervisor,
  getEngine,
  installedEngines,
  isTerminalMethod,
  resolveEngineEntry,
  resolveCodexCliEntry,
  runTerminalAuth,
  AuthRequiredError,
  ENGINES,
  DEFAULT_ENGINE_ID,
  type EngineSupervisor,
  type PromptBlock,
} from "@weave/agent";
import {
  Ledger,
  SessionStore,
  ConversationStore,
  TasksStore,
  runStopSequence,
  readLatest,
  buildBrief,
  titleFromPrompt,
  weaveDirFor,
  newRunId,
  readGitStatus,
  discoverSkills,
  formatSkillCatalog,
  resolveCatalog,
  planActivation,
  formatActivationPlansSystemPrompt,
  type ConversationMeta,
  type GitStatus,
  type NormalizedPlugin,
  type ActivePluginRef,
  type ActivationPlan,
  type Checkpoint,
} from "@weave/core";
import type {
  AuthMethod,
  CheckpointReason,
  EngineAuthMethod,
  EngineAuthOperation,
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
  Usage,
} from "@weave/protocol";
import { toEngineAuthMethod, isAuthRequiredError } from "@weave/protocol";

export const DEFAULT_PORT = 8137;
export type { GitStatus, GitChange, ConversationMeta } from "@weave/core";

/** Messages the UI sends us. */
export type ClientMessage =
  | {
      type: "prompt";
      text: string;
      persona?: string;
      /** Plugins active for this turn (always + manually toggled on). */
      plugins?: ActivePluginRef[];
      /** Screenshots the user attached, each with its own fix/build instructions. */
      images?: { data: string; mimeType: string; prompt?: string }[];
    }
  | { type: "cancel" }
  | { type: "set-config"; configId: string; value: string }
  | { type: "git" }
  | { type: "new-chat"; instructions?: string }
  | { type: "open-chat"; sessionId: string }
  /** Rebind this conversation to a different engine. */
  | { type: "switch-engine"; engineId: string }
  /** Sign in to an engine that refused a session. */
  | { type: "start-auth"; engineId: string; methodId: string; secret?: string }
  /** Abandon a sign-in that is still running. */
  | { type: "cancel-auth" }
  /** Fuzzy path lookup for the `@file` mention menu. */
  | { type: "list-files"; query: string }
  /** Read one image a past prompt attached, for the transcript's thumbnail. */
  | { type: "read-attachment"; path: string }
  /** Refresh installed engines list. */
  | { type: "refresh-engines" }
  /** Re-scan the plugin catalog from disk. */
  | { type: "refresh-plugins" };

/** Images we will inline into the transcript, by extension. */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** Anything larger is a transcript thumbnail nobody wants over a socket. */
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

/**
 * One image from a past prompt, as a data URI.
 *
 * Engines save what the user attached under the project (Antigravity writes
 * `.agy-acp/attachments/<uuid>.png`) and replay the prompt as a path, so a
 * resumed conversation has only the path to show. Reading is confined to the
 * project dir — the renderer must not be able to turn this into "read any file
 * on the machine" by asking for one.
 */
async function readAttachment(
  projectDir: string,
  path: string,
): Promise<string | null> {
  try {
    const absolute = resolve(projectDir, path);
    if (!isInside(projectDir, absolute)) return null;
    const mime = IMAGE_MIME[extname(absolute).toLowerCase()];
    if (!mime) return null;
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_ATTACHMENT_BYTES) return null;
    const bytes = await readFile(absolute);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    // A deleted or unreadable attachment is ordinary on an old conversation.
    return null;
  }
}

/** Messages we send the UI. */
export type ServerMessage =
  | {
      type: "ready";
      sessionId: string;
      cwd: string;
      engineId: string;
      engineLabel: string;
      /**
       * The agent's own settings. Claude Code does NOT populate
       * `newSession().models` — everything is in configOptions, which is also
       * what Berd drives via `setSessionConfigOption`.
       */
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
  /** An attachment as a data URI, or `null` when it could not be read. */
  | { type: "attachment"; path: string; dataUri: string | null }
  | { type: "turn-end"; stopReason: string; usage?: Usage | null }
  | { type: "error"; message: string }
  /**
   * An engine refused to open a session until the user signs in.
   *
   * Sent INSTEAD of `error`, because the engine's own message is a dead end:
   * it names the problem and offers nothing to do about it. `methods` is what
   * the engine advertised at `initialize`.
   */
  | {
      type: "auth-required";
      engineId: string;
      engineLabel: string;
      message: string;
      methods: EngineAuthMethod[];
    }
  /**
   * The whole current state of a sign-in, resent on every change.
   *
   * A full snapshot rather than a delta: there is then no incremental merge
   * for the UI to get wrong, and a remount rehydrates from one message.
   */
  | { type: "auth-state"; operation: EngineAuthOperation }
  /** Which engines ("providers") have their package installed. */
  | {
      type: "engines";
      engines: { id: string; label: string; installed: boolean }[];
    }
  /** The full plugin catalog discovered from disk. */
  | { type: "plugin-catalog"; plugins: NormalizedPlugin[] }
  /** The chat list for this project, newest activity first. */
  | { type: "chats"; chats: ConversationMeta[]; activeSessionId: string | null }
  /** Project-relative paths matching a `list-files` query. */
  | { type: "files"; query: string; files: string[] }
  /** Wipe the transcript — sent right before a different chat replays. */
  | { type: "reset" }
  /**
   * A Stop sequence (CONTINUATION.md §8) just checkpointed the task. Renders
   * the CheckpointBlock "Continue with…" UI — `continue_with_engine` is
   * handled by sending an ordinary `switch-engine`, which already builds its
   * brief from this same checkpoint (see `bindEngine`).
   */
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

const FILE_SEARCH_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  ".turbo",
  "coverage",
]);

/**
 * Walk the project for files whose path contains `query` (case-insensitive),
 * ranked by a basename hit first. Bounded in both directions — depth and
 * result count — so a large repo never stalls the menu.
 */
async function searchProjectFiles(
  root: string,
  query: string,
  limit = 20,
): Promise<string[]> {
  const needle = query.toLowerCase();
  const hits: { path: string; rank: number }[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8 || hits.length >= limit * 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (FILE_SEARCH_IGNORE.has(entry.name)) continue;
      const abs = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        await walk(abs, depth + 1);
      } else if (entry.isFile()) {
        const rel = relative(root, abs);
        const lower = rel.toLowerCase();
        if (!needle || lower.includes(needle)) {
          hits.push({
            path: rel,
            rank: entry.name.toLowerCase().includes(needle) ? 0 : 1,
          });
        }
      }
    }
  };

  await walk(root, 0);
  return hits
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length)
    .slice(0, limit)
    .map((h) => h.path);
}

function safeSend(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

export async function startAcpServer(options: {
  projectDir: string;
  port?: number;
}): Promise<AcpServerHandle> {
  const projectDir = resolve(options.projectDir);
  const port = options.port ?? DEFAULT_PORT;
  const wss = new WebSocketServer({ port, host: "127.0.0.1" });
  const store = new SessionStore(weaveDirFor(projectDir));

  console.log(`[server] ws://127.0.0.1:${port}  project: ${projectDir}`);

  wss.on("connection", (socket) => {
    void handleConnection(socket, projectDir, store).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[connection]", message);
      safeSend(socket, { type: "error", message });
    });
  });

  return {
    port,
    close: () => new Promise<void>((done) => wss.close(() => done())),
  };
}

async function handleConnection(
  socket: WebSocket,
  projectDir: string,
  store: SessionStore,
): Promise<void> {
  // Autoload environment variables from project directory if available
  try {
    process.loadEnvFile(resolve(projectDir, ".env"));
  } catch {}
  try {
    process.loadEnvFile(resolve(projectDir, ".env.local"));
  } catch {}

  const send = (message: ServerMessage) => safeSend(socket, message);
  const ledger = new Ledger(weaveDirFor(projectDir), newRunId());
  // Instructions that ride the *next* prompt only, then clear: new-chat
  // instructions, and the brief written on an engine switch (see
  // `checkpointTask` / `bindEngine` below).
  let pendingPreamble: string | null = null;

  // Skills are a property of the repo; discover them once per connection.
  const skillCatalog = formatSkillCatalog(await discoverSkills(projectDir));

  // The plugin catalog is machine-wide (read from ~/.claude). Cached per
  // connection; a `refresh-plugins` message re-scans.
  let pluginCatalog: NormalizedPlugin[] = [];
  let pluginsById = new Map<string, NormalizedPlugin>();
  const loadPluginCatalog = async () => {
    pluginCatalog = await resolveCatalog();
    pluginsById = new Map(pluginCatalog.map((p) => [p.id, p]));
  };

  const isSandboxed =
    process.env.WEAVE_SANDBOX === "1" || process.env.SANDBOXED === "true";

  const task: TaskContract = {
    id: "desktop",
    prompt: "",
    cwd: projectDir,
    sandboxed: isSandboxed,
  };

  ledger.append("run.started", { cwd: projectDir, config: { via: "desktop" } });

  const installed = new Set(installedEngines().map((e) => e.id));
  const uniqueEngines = Array.from(
    new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
  );
  send({
    type: "engines",
    engines: uniqueEngines.map((e) => ({
      id: e.id,
      label: e.label,
      installed: installed.has(e.id),
    })),
  });

  await loadPluginCatalog();
  send({ type: "plugin-catalog", plugins: pluginCatalog });

  const conversations = new ConversationStore(weaveDirFor(projectDir));
  const resumeId = await store.get(projectDir);
  let persisted = false;

  // Continuation (CONTINUATION.md). V1.2 §12(C): one task per connection —
  // the ledger's own runId is a stable, already-unique id for it. Created
  // lazily on the first prompt, since `TaskRecord.goal` is the user's
  // original request and nothing has been asked yet at connection open.
  const tasksStore = new TasksStore(weaveDirFor(projectDir));
  const continuationTaskId = ledger.runId;
  let taskCreated = false;
  let taskGoal = "";

  /** Steps 1-6 of the Stop sequence (§8), plus step 7 (`checkpoint.created`
   * on the live ledger) since this call site always has one. No-op when
   * nothing has been asked yet — there is no task to checkpoint. */
  const checkpointTask = async (
    reason: CheckpointReason,
    cancel?: () => Promise<void> | void,
  ): Promise<Checkpoint | null> => {
    if (!taskCreated) {
      await cancel?.();
      return null;
    }
    const { checkpoint } = await runStopSequence({
      weaveDir: weaveDirFor(projectDir),
      cwd: projectDir,
      taskId: continuationTaskId,
      runId: ledger.runId,
      goal: taskGoal,
      reason,
      tasksStore,
      cancel,
    });
    ledger.append("checkpoint.created", {
      taskId: continuationTaskId,
      checkpointId: checkpoint.id,
      atSeq: checkpoint.seq,
      reason: checkpoint.reason,
    });
    return checkpoint;
  };

  /** The counts + notes CheckpointBlock renders — derived straight from the
   * folded `TaskState`, never a separate thing that could drift from it. */
  const summarizeCheckpoint = (checkpoint: Checkpoint) => {
    const { state } = checkpoint;
    const filesModified = state.files.modified.length + state.files.created.length + state.files.deleted.length;
    const testsPassed = state.verification.filter((v) => v.status === "passed").length;
    const testsFailed = state.verification.filter((v) => v.status === "failed").length;
    const notes = state.inFlight.map(
      (t) => `${t.locations[0] ?? t.title} — edit was in progress when the task stopped`,
    );
    return {
      checkpointId: checkpoint.id,
      reason: checkpoint.reason,
      summary: {
        filesModified,
        commandsExecuted: state.commands.length,
        testsPassed,
        testsFailed,
        notes,
      },
    };
  };

  const sendChats = async () =>
    send({
      type: "chats",
      chats: (await conversations.list()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
      activeSessionId: supervisor?.current?.sessionId ?? "",
    });

  let currentEngineId = process.env.ENGINE_ID || DEFAULT_ENGINE_ID;
  // The first session announces itself through this sink. Every later one —
  // new chat, opened chat, engine switch — is announced by its own handler,
  // which knows the right engine id and reset semantics.
  let announced = false;

  // ---------------------------------------------------------------------
  // Signing in to an engine
  //
  // Mirrors Berd's agent-setup flow: the backend owns the operation, the UI is
  // a pure view, and every change ships the whole bounded snapshot. Here the
  // backend is this server rather than the Rust shell, because this is the
  // process that owns the engine children and already has a live socket.
  // ---------------------------------------------------------------------

  /** The sign-in in flight, if any. One at a time — it is a modal action. */
  let auth: { operation: EngineAuthOperation; abort: AbortController } | null =
    null;
  /** Methods an engine advertised when it refused, keyed by engine id. */
  const authMethodsByEngine = new Map<string, AuthMethod[]>();

  const publishAuth = (patch: Partial<EngineAuthOperation>) => {
    if (!auth) return;
    auth.operation = { ...auth.operation, ...patch };
    send({ type: "auth-state", operation: auth.operation });
  };

  /** Relay an auth refusal as something the UI can act on. */
  const sendAuthRequired = (error: AuthRequiredError) => {
    let rawMethods = [...error.authMethods];
    const engineId = error.engineId;
    if (rawMethods.length === 0) {
      if (engineId === "antigravity" || engineId === "agy") {
        rawMethods.push({
          id: "agy-login",
          name: "Sign in with Google Antigravity",
          type: "terminal",
          command: "agy",
          args: ["auth", "login"],
          _meta: {
            "terminal-auth": {
              command: "agy",
              args: ["auth", "login"],
            },
          },
        } as unknown as AuthMethod);
      } else if (engineId === "claude-code") {
        const engine = ENGINES["claude-code"];
        if (engine) {
          rawMethods.push(
            {
              id: "claude-ai-login",
              name: "Claude Subscription",
              type: "terminal",
              description: "Use Claude subscription",
              args: ["--cli", "auth", "login", "--claudeai"],
              _meta: {
                "terminal-auth": {
                  command: process.execPath,
                  args: [
                    resolveEngineEntry(engine),
                    "--cli",
                    "auth",
                    "login",
                    "--claudeai",
                  ],
                  label: "Claude Login",
                },
              },
            } as unknown as AuthMethod,
            {
              id: "console-login",
              name: "Anthropic Console",
              type: "terminal",
              description: "Use Anthropic Console (API usage billing)",
              args: ["--cli", "auth", "login", "--console"],
              _meta: {
                "terminal-auth": {
                  command: process.execPath,
                  args: [
                    resolveEngineEntry(engine),
                    "--cli",
                    "auth",
                    "login",
                    "--console",
                  ],
                  label: "Anthropic Console Login",
                },
              },
            } as unknown as AuthMethod,
          );
        }
      }
    }
    if (error.engineId === "codex") {
      const codexCli = resolveCodexCliEntry(getEngine("codex"));
      const isNative = !codexCli.endsWith(".js");
      const cmd = isNative ? codexCli : process.execPath;
      const baseArgs = isNative ? [] : [codexCli];
      if (!rawMethods.some((m) => m.id === "chat-gpt-device-code")) {
        rawMethods.unshift({
          id: "chat-gpt-device-code",
          name: "Sign in with Device Code",
          type: "terminal",
          description: "Sign in using one-time verification code in browser (recommended)",
          _meta: {
            "terminal-auth": {
              command: cmd,
              args: [...baseArgs, "login", "--device-auth"],
              label: "ChatGPT Device Auth",
            },
          },
        } as unknown as AuthMethod);
      }
      if (!rawMethods.some((m) => m.id === "chat-gpt" || m.id === "codex-login")) {
        rawMethods.push({
          id: "chat-gpt",
          name: "Sign in with ChatGPT",
          type: "terminal",
          description: "Sign in using your OpenAI ChatGPT account",
          _meta: {
            "terminal-auth": {
              command: cmd,
              args: [...baseArgs, "login"],
              label: "ChatGPT Login",
            },
          },
        } as unknown as AuthMethod);
      }
      if (!rawMethods.some((m) => m.id === "api-key")) {
        rawMethods.push({
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
        } as unknown as AuthMethod);
      }
    }
    authMethodsByEngine.set(error.engineId, rawMethods);
    send({
      type: "auth-required",
      engineId: error.engineId,
      engineLabel: getEngine(error.engineId).label,
      message: error.message,
      methods: rawMethods.map(toEngineAuthMethod),
    });
  };

  /**
   * Bind the conversation to `engineId`, announcing the result.
   *
   * Shared by `switch-engine` and by the retry after a successful sign-in, so
   * both paths report identically — including refusing again, which is the
   * normal outcome when a login was abandoned halfway.
   */
  const bindEngine = async (engineId: string): Promise<boolean> => {
    try {
      if (!supervisor) {
        supervisor = await createEngineSupervisor({ ...supervisorOptions, engineId });
      } else {
        await supervisor.switchTo(engineId);
      }
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        sendAuthRequired(error);
        return false;
      }
      if (isAuthRequiredError(error)) {
        const errObj = error as { data?: { authMethods?: AuthMethod[] } };
        const methods: AuthMethod[] =
          errObj?.data?.authMethods ?? authMethodsByEngine.get(engineId) ?? [];
        sendAuthRequired(new AuthRequiredError(engineId, methods, error));
        return false;
      }
      throw error;
    }
    currentEngineId = engineId;
    persisted = false;
    // The new engine's session never saw the conversation — the switch-engine
    // handler already ran the Stop sequence to checkpoint it, so the brief
    // built from that checkpoint is what carries it forward now (§9). Not the
    // transcript: bounded, sectioned by trust, and the filesystem stays
    // authoritative rather than a 40-turn prose dump.
    if (taskCreated) {
      const checkpoint = await readLatest(weaveDirFor(projectDir), continuationTaskId);
      pendingPreamble = checkpoint ? buildBrief(checkpoint, getEngine(engineId)) : null;
    }
    ledger.append("agent.session", {
      taskId: task.id,
      sessionId: supervisor.current.sessionId,
      resumed: false,
      configOptions: supervisor.current.configOptions,
    });
    // A task already exists (the user has prompted before) — this bind is a
    // new attempt on it. The switch-engine handler already ran the Stop
    // sequence to close out the previous attempt before calling us.
    if (taskCreated) {
      const updated = await tasksStore.startAttempt(
        continuationTaskId,
        engineId,
        supervisor.current.sessionId,
        ledger.runId,
        ledger.seq,
      );
      ledger.append("attempt.started", {
        taskId: continuationTaskId,
        attemptIndex: updated.attempts.length - 1,
        engineId,
        sessionId: supervisor.current.sessionId,
      });
    }
    send({ type: "reset" });
    send({
      type: "ready",
      sessionId: supervisor.current.sessionId,
      cwd: projectDir,
      engineId: currentEngineId,
      engineLabel: getEngine(currentEngineId).label,
      configOptions: supervisor.current.configOptions,
      resumed: false,
    });
    await sendChats();
    return true;
  };

  /**
   * Open the first engine that will actually talk to us.
   *
   * The default engine needs a sign-in on a fresh install, and a connection
   * that dies here leaves the user with a dead window and no way to sign in —
   * every action below needs a live supervisor. So: report the refusal (the UI
   * gets a real sign-in button), then fall back to an engine that opens, and
   * say which one. Announced, never silent.
   */
  const openFirstUsableEngine = async (
    wanted: string,
    options: Omit<Parameters<typeof createEngineSupervisor>[0], "engineId">,
  ) => {
    const order = [
      wanted,
      ...installedEngines()
        .map((entry) => entry.id)
        .filter((id) => id !== wanted),
    ];
    let refusal: AuthRequiredError | null = null;
    let failure: unknown = null;

    for (const engineId of order) {
      try {
        currentEngineId = engineId;
        const opened = await createEngineSupervisor({ ...options, engineId });
        return opened;
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          if (engineId === wanted) throw error;
          refusal ??= error;
          continue;
        }
        if (isAuthRequiredError(error)) {
          const errObj = error as { data?: { authMethods?: AuthMethod[] } };
          const methods: AuthMethod[] =
            errObj?.data?.authMethods ?? authMethodsByEngine.get(engineId) ?? [];
          const authErr = new AuthRequiredError(engineId, methods, error);
          if (engineId === wanted) throw authErr;
          refusal ??= authErr;
          continue;
        }
        // Not an auth problem — the engine is missing, or its binary would not
        // start. Try the next installed one instead of failing the session:
        // the wanted engine can be one the user never installed (a stale
        // per-project choice, or the registry default on a fresh machine), and
        // refusing to open anything left the app showing "not installed" with
        // a working engine sitting right there.
        failure ??= error;
      }
    }
    // Nothing opened. Rethrow the auth refusal rather than a generic failure,
    // so the reason survives to the caller.
    throw refusal ?? failure ?? new Error("No engine could open a session.");
  };

  const supervisorOptions: Omit<Parameters<typeof createEngineSupervisor>[0], "engineId"> = {
    task,
    policy: confineToTaskDir,
    resumeSessionId: resumeId,
    sink: {
      onSpawned: (pid, entry) =>
        ledger.append("agent.spawned", { taskId: task.id, pid, entry }),
      onSession: (sessionId, resumed, configOptions) => {
        ledger.append("agent.session", {
          taskId: task.id,
          sessionId,
          resumed,
          configOptions,
        });
        // A resumed session is already on the agent's disk, so it is safe to
        // record. A new one is not until it has a turn.
        persisted = resumed;
        if (announced) return;
        announced = true;
        send({
          type: "ready",
          sessionId,
          cwd: projectDir,
          engineId: currentEngineId,
          engineLabel: getEngine(currentEngineId).label,
          configOptions,
          resumed,
        });
        void readGitStatus(projectDir).then((git) =>
          send({ type: "git-status", git }),
        );
      },
      onUpdate: (update, replay) => {
        const event = ledger.append("agent.message", { taskId: task.id, update });
        send({
          type: "update",
          update,
          replay,
          source: { runId: event.runId, seq: event.seq },
        });
      },
      onPermission: (toolCall, options, decision) => {
        ledger.append("permission.requested", { taskId: task.id, toolCall, options });
        ledger.append("permission.decided", {
          taskId: task.id,
          toolCall,
          decision: decision.decision,
          optionId: decision.optionId,
          reason: decision.reason,
        });
      },
      onFileRead: (path) => ledger.append("file.read", { taskId: task.id, path }),
      onFileWritten: (path, bytes) =>
        ledger.append("file.written", { taskId: task.id, path, bytes }),
    },
  };

  let supervisor: EngineSupervisor | null = null;
  try {
    supervisor = await openFirstUsableEngine(currentEngineId, supervisorOptions);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      sendAuthRequired(error);
    } else if (isAuthRequiredError(error)) {
      const errObj = error as { data?: { authMethods?: AuthMethod[] } };
      const methods: AuthMethod[] =
        errObj?.data?.authMethods ?? authMethodsByEngine.get(currentEngineId) ?? [];
      sendAuthRequired(new AuthRequiredError(currentEngineId, methods, error));
    } else {
      throw error;
    }
  }

  if (supervisor) {
    console.log(
      "[session]",
      supervisor.current.sessionId,
      supervisor.current.resumed ? "(resumed)" : "(new)",
      `config: ${supervisor.current.configOptions.map((o) => o.id).join(", ") || "none"}`,
    );
  }

  void sendChats();

  /** The one system block that rides every prompt. */
  const composeSystem = (
    userText: string,
    persona?: string,
    pluginBlock?: string,
  ): string => {
    const blocks = [
      pendingPreamble,
      persona?.trim() || null,
      pluginBlock?.trim() || null,
      skillCatalog,
    ].filter((b): b is string => !!b);
    pendingPreamble = null;
    if (blocks.length === 0) return userText;
    return `<system>\n${blocks.join("\n\n")}\n</system>\n\n${userText}`;
  };

  /**
   * Resolve the active plugin refs against the live engine into an activation
   * plan per plugin, and the `<enabled-plugins>` block. Records a
   * `plugin.activated` ledger event for each so a run is explainable later.
   */
  const resolvePlugins = (refs: ActivePluginRef[] | undefined): string | undefined => {
    if (!refs || refs.length === 0) return undefined;
    const engine = ENGINES[currentEngineId];
    if (!engine) return undefined;
    const profile = {
      id: engine.id,
      pluginModel: engine.pluginModel,
      mcp: engine.capabilities.mcp,
    };
    const plans: ActivationPlan[] = [];
    for (const ref of refs) {
      const plugin = pluginsById.get(ref.id);
      if (!plugin) continue;
      const plan = planActivation(plugin, ref, profile);
      plans.push(plan);
      ledger.append("plugin.activated", {
        taskId: task.id,
        pluginId: plan.pluginId,
        version: plan.version,
        contentHash: plan.contentHash,
        engineId: plan.engineId,
        model: plan.model,
        mode: plan.mode,
        activatedCapabilities: plan.activatedCapabilities,
        unsupportedCapabilities: plan.unsupportedCapabilities.map(
          (c) => `${c.kind}:${c.name}`,
        ),
      });
    }
    return formatActivationPlansSystemPrompt(plans);
  };

  // Prompts queue: the UI can only send one at a time, but a queued send
  // during a turn must not interleave two ACP prompts on one session.
  let pending: Promise<unknown> = Promise.resolve();

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send({ type: "error", message: "Malformed message" });
      return;
    }

    switch (message.type) {
      case "cancel":
        void checkpointTask("user_cancellation", () => supervisor?.current?.cancel())
          .then((checkpoint) => {
            if (checkpoint) send({ type: "checkpoint", ...summarizeCheckpoint(checkpoint) });
          })
          .catch((error: unknown) =>
            send({
              type: "error",
              message: `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        return;

      case "switch-engine": {
        const nextEngineId = message.engineId;
        if (!ENGINES[nextEngineId]) {
          send({ type: "error", message: `Unknown engine: ${nextEngineId}` });
          return;
        }
        // Already bound to this engine (common when a custom agent maps to the
        // engine that is already running). Nothing to switch — but the UI has
        // already flipped into its "Switching…" state, so it needs an answer or
        // it hangs there forever. Re-announce the current session.
        if (nextEngineId === currentEngineId) {
          if (supervisor?.current) {
            send({
              type: "ready",
              sessionId: supervisor.current.sessionId,
              cwd: projectDir,
              engineId: currentEngineId,
              engineLabel: getEngine(currentEngineId).label,
              configOptions: supervisor.current.configOptions,
              resumed: true,
            });
          }
          return;
        }
        pending = pending
          // Supersede whatever is in flight on the old engine (II.13), and
          // checkpoint the attempt being left behind — an explicit handoff
          // is one of the six terminal reasons (§8).
          .then(() =>
            checkpointTask("explicit_handoff", () =>
              supervisor?.current?.cancel().catch(() => {}),
            ),
          )
          // An auth refusal is reported by `bindEngine` as `auth-required`,
          // not as an error — it is a state with an action, not a failure.
          .then(() => bindEngine(nextEngineId))
          .catch((error: unknown) => {
            if (error instanceof AuthRequiredError) {
              sendAuthRequired(error);
              return;
            }
            if (isAuthRequiredError(error)) {
              const errObj = error as { data?: { authMethods?: AuthMethod[] } };
              const methods: AuthMethod[] =
                errObj?.data?.authMethods ?? authMethodsByEngine.get(nextEngineId) ?? [];
              sendAuthRequired(new AuthRequiredError(nextEngineId, methods, error));
              return;
            }
            send({
              type: "error",
              message: `Could not switch engine: ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          });
        return;
      }

      case "refresh-engines": {
        const installed = new Set(installedEngines().map((e) => e.id));
        const uniqueEngines = Array.from(
          new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
        );
        send({
          type: "engines",
          engines: uniqueEngines.map((e) => ({
            id: e.id,
            label: e.label,
            installed: installed.has(e.id),
          })),
        });
        return;
      }

      case "refresh-plugins": {
        void loadPluginCatalog().then(() =>
          send({ type: "plugin-catalog", plugins: pluginCatalog }),
        );
        return;
      }

      case "cancel-auth":
        auth?.abort.abort();
        return;

      case "start-auth": {
        if (auth?.operation.status === "running") return;
        const { engineId, methodId } = message;
        const normalizedEngineId =
          engineId === "agy" || engineId === "antigravity"
            ? "antigravity"
            : engineId;
        const engine = ENGINES[normalizedEngineId] || ENGINES[engineId];
        let method = (
          authMethodsByEngine.get(engineId) ??
          authMethodsByEngine.get(normalizedEngineId)
        )?.find((entry) => entry.id === methodId);
        if (
          !method &&
          normalizedEngineId === "antigravity" &&
          methodId === "agy-login"
        ) {
          method = {
            id: "agy-login",
            name: "Sign in with Google Antigravity",
            type: "terminal",
            command: "agy",
            args: ["auth", "login"],
            _meta: {
              "terminal-auth": {
                command: "agy",
                args: ["auth", "login"],
              },
            },
          } as unknown as AuthMethod;
        }
        if (!method && normalizedEngineId === "claude-code" && engine) {
          if (methodId === "claude-ai-login") {
            method = {
              id: "claude-ai-login",
              name: "Claude Subscription",
              type: "terminal",
              description: "Use Claude subscription",
              args: ["--cli", "auth", "login", "--claudeai"],
              _meta: {
                "terminal-auth": {
                  command: process.execPath,
                  args: [
                    resolveEngineEntry(engine),
                    "--cli",
                    "auth",
                    "login",
                    "--claudeai",
                  ],
                  label: "Claude Login",
                },
              },
            } as unknown as AuthMethod;
          } else if (methodId === "console-login") {
            method = {
              id: "console-login",
              name: "Anthropic Console",
              type: "terminal",
              description: "Use Anthropic Console (API usage billing)",
              args: ["--cli", "auth", "login", "--console"],
              _meta: {
                "terminal-auth": {
                  command: process.execPath,
                  args: [
                    resolveEngineEntry(engine),
                    "--cli",
                    "auth",
                    "login",
                    "--console",
                  ],
                  label: "Anthropic Console Login",
                },
              },
            } as unknown as AuthMethod;
          }
        }
        if (!method && normalizedEngineId === "codex" && engine) {
          const codexCli = resolveCodexCliEntry(engine);
          const isNative = !codexCli.endsWith(".js");
          const cmd = isNative ? codexCli : process.execPath;
          const baseArgs = isNative ? [] : [codexCli];
          if (methodId === "chat-gpt" || methodId === "codex-login") {
            method = {
              id: methodId,
              name: "Sign in with ChatGPT",
              type: "terminal",
              description: "Sign in using your OpenAI ChatGPT account",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login"],
                  label: "ChatGPT Login",
                },
              },
            } as unknown as AuthMethod;
          } else if (methodId === "chat-gpt-device-code") {
            method = {
              id: "chat-gpt-device-code",
              name: "Sign in with Device Code",
              type: "terminal",
              description: "Sign in using one-time device verification code",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--device-auth"],
                  label: "ChatGPT Device Auth",
                },
              },
            } as unknown as AuthMethod;
          } else if (methodId === "api-key") {
            method = {
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
            } as unknown as AuthMethod;
          }
        }
        if (
          method &&
          normalizedEngineId === "codex" &&
          engine &&
          !isTerminalMethod(method)
        ) {
          const codexCli = resolveCodexCliEntry(engine);
          const isNative = !codexCli.endsWith(".js");
          const cmd = isNative ? codexCli : process.execPath;
          const baseArgs = isNative ? [] : [codexCli];
          if (method.id === "chat-gpt") {
            method = {
              ...method,
              type: "terminal",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--device-auth"],
                  label: "ChatGPT Login",
                },
              },
            } as unknown as AuthMethod;
          } else if (method.id === "chat-gpt-device-code") {
            method = {
              ...method,
              type: "terminal",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--device-auth"],
                  label: "ChatGPT Device Auth",
                },
              },
            } as unknown as AuthMethod;
          } else if (method.id === "api-key") {
            method = {
              ...method,
              type: "terminal",
              _meta: {
                "terminal-auth": {
                  command: cmd,
                  args: [...baseArgs, "login", "--with-api-key"],
                  label: "OpenAI API Key Login",
                },
              },
            } as unknown as AuthMethod;
          }
        }
        if (!engine || !method) {
          send({ type: "error", message: "That sign-in is no longer available." });
          return;
        }

        const abort = new AbortController();
        auth = {
          abort,
          operation: {
            engineId: normalizedEngineId,
            methodId,
            phase: "starting",
            status: "running",
            output: [],
            error: null,
          },
        };
        send({ type: "auth-state", operation: auth.operation });

        pending = pending
          .then(async () => {
            // A terminal method is the only kind that needs a process. The
            // others are satisfied by `authenticate` alone — and calling it on
            // a terminal method is a no-op that reports success, which is
            // exactly how this looked like it worked before.
            if (isTerminalMethod(method)) {
              publishAuth({ phase: "authenticating" });
              const result = await runTerminalAuth({
                engine,
                method,
                cwd: projectDir,
                input: message.secret,
                signal: abort.signal,
                onOutput: (output) => publishAuth({ output }),
              });
              if (!result.ok) {
                publishAuth({
                  status: "failed",
                  output: result.output,
                  error: abort.signal.aborted
                    ? "Sign-in cancelled."
                    : `Sign-in exited with code ${result.code ?? "unknown"}.`,
                });
                return;
              }
              publishAuth({ output: result.output });
            }

            // Tell the engine the method was satisfied. Best-effort: some
            // engines have already recorded it themselves by this point and
            // answer with an error rather than acknowledging it twice.
            publishAuth({ phase: "verifying" });
            if (supervisor) {
              await supervisor.current.authenticate(methodId).catch(() => {});
            }

            // The only proof that matters: can it open a session now?
            const bound = await bindEngine(engineId);
            publishAuth(
              bound
                ? { status: "succeeded", error: null }
                : {
                    status: "failed",
                    error: "Signed in, but the engine still refuses a session.",
                  },
            );
          })
          .catch((error: unknown) =>
            publishAuth({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return;
      }

      case "git":
        void readGitStatus(projectDir).then((git) =>
          send({ type: "git-status", git }),
        );
        return;

      case "read-attachment": {
        void readAttachment(projectDir, message.path).then((dataUri) =>
          send({ type: "attachment", path: message.path, dataUri }),
        );
        return;
      }

      case "list-files": {
        const query = message.query;
        void searchProjectFiles(projectDir, query).then((files) =>
          send({ type: "files", query, files }),
        );
        return;
      }

      case "set-config":
        if (!supervisor) return;
        supervisor.current
          .setConfigOption(message.configId, message.value)
          .then(() =>
            send({
              type: "config-changed",
              configId: message.configId,
              value: message.value,
            }),
          )
          .catch(() =>
            // `effort` and `fast` exist on Opus and are refused on Haiku; the
            // agent reports that as a bare "Internal error", so say something
            // useful and let the UI roll its optimistic value back.
            send({
              type: "config-rejected",
              configId: message.configId,
              message: `"${message.configId}" is not available for the current model.`,
            }),
          );
        return;

      case "new-chat": {
        if (!supervisor) return;
        const instructions = message.instructions;
        pending = pending
          .then(() => supervisor!.current.newSession())
          .then(async (sessionId) => {
            persisted = false;
            pendingPreamble = instructions?.trim() || null;
            send({ type: "reset" });
            send({
              type: "ready",
              sessionId,
              cwd: projectDir,
              engineId: currentEngineId,
              engineLabel: getEngine(currentEngineId).label,
              configOptions: supervisor!.current.configOptions,
              resumed: false,
            });
            await sendChats();
          })
          .catch((error: unknown) =>
            send({
              type: "error",
              message: `Could not start a new chat: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        return;
      }

      case "open-chat": {
        if (!supervisor) return;
        const wanted = message.sessionId;
        pending = pending
          .then(async () => {
            send({ type: "reset" });
            const ok = await supervisor!.current.resumeSession(wanted);
            if (!ok) {
              send({ type: "error", message: "Could not open that chat." });
              await sendChats();
              return;
            }
            persisted = true;
            await store.set(projectDir, supervisor!.current.sessionId);
            send({
              type: "ready",
              sessionId: supervisor!.current.sessionId,
              cwd: projectDir,
              engineId: currentEngineId,
              engineLabel: getEngine(currentEngineId).label,
              configOptions: supervisor!.current.configOptions,
              resumed: true,
            });
            await sendChats();
            send({ type: "git-status", git: await readGitStatus(projectDir) });
          })
          .catch((error: unknown) =>
            send({
              type: "error",
              message: `Could not open that chat: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        return;
      }

      case "prompt": {
        if (!supervisor) {
          send({
            type: "error",
            message: "Please sign in to the AI engine before sending a message.",
          });
          return;
        }
        const promptText = message.text;
        // Set synchronously so a `cancel` arriving before the store write
        // below finishes still sees a task in progress — see `checkpointTask`.
        const isFirstPrompt = !taskCreated;
        if (isFirstPrompt) {
          taskCreated = true;
          taskGoal = promptText;
        }
        // The persona block + skills catalog + any pending preamble ride every
        // prompt as one <system> block, so nothing drifts over a conversation.
        const pluginBlock = resolvePlugins(message.plugins);
        const outgoing = composeSystem(promptText, message.persona, pluginBlock);
        const blocks: PromptBlock[] = [{ type: "text", text: outgoing }];
        // Number each image and put its instructions immediately before it, so
        // a multi-image prompt can't be misread about which note belongs to
        // which screenshot.
        (message.images ?? []).forEach((image, i) => {
          const note = image.prompt?.trim();
          blocks.push({
            type: "text",
            text: note ? `Image ${i + 1}: ${note}` : `Image ${i + 1}:`,
          });
          blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
        });
        pending = pending
          .then(async () => {
            if (!isFirstPrompt) return;
            const seqStart = ledger.seq;
            await tasksStore.create(
              continuationTaskId,
              taskGoal,
              projectDir,
              currentEngineId,
              supervisor!.current.sessionId,
              ledger.runId,
              seqStart,
            );
            ledger.append("attempt.started", {
              taskId: continuationTaskId,
              attemptIndex: 0,
              engineId: currentEngineId,
              sessionId: supervisor!.current.sessionId,
            });
          })
          .then(() => supervisor!.current.prompt(blocks))
          .then(async ({ stopReason, usage }) => {
            send({ type: "turn-end", stopReason, usage });
            ledger.append("task.finished", {
              taskId: task.id,
              status: "ok",
              stopReason,
              wallMs: 0,
            });

            // Now the session exists on the agent's disk and can be resumed.
            if (!persisted) {
              persisted = true;
              await store.set(projectDir, supervisor!.current.sessionId);
            }
            // Title is filled from the first prompt; later turns only bump
            // `updatedAt` so the chat floats to the top of the list.
            await conversations.record(
              supervisor!.current.sessionId,
              titleFromPrompt(promptText),
            );
            await sendChats();

            send({ type: "git-status", git: await readGitStatus(projectDir) });
          })
          .catch((error: unknown) => {
            if (error instanceof AuthRequiredError) {
              sendAuthRequired(error);
              return;
            }
            if (isAuthRequiredError(error)) {
              const errObj = error as { data?: { authMethods?: AuthMethod[] } };
              const methods: AuthMethod[] =
                errObj?.data?.authMethods ?? authMethodsByEngine.get(currentEngineId) ?? [];
              sendAuthRequired(new AuthRequiredError(currentEngineId, methods, error));
              return;
            }
            const text = error instanceof Error ? error.message : String(error);
            ledger.append("error", { taskId: task.id, where: "prompt", message: text });
            send({ type: "error", message: text });
          });
        return;
      }
    }
  });

  if (supervisor) live.add(supervisor);

  socket.on("close", () => {
    ledger.append("run.finished", { status: "ok", wallMs: 0 });
    auth?.abort.abort();
    if (supervisor) live.delete(supervisor);
    supervisor?.killAll();
  });
}

/**
 * Every supervisor with a live socket.
 *
 * Engines are spawned into their own process group (see `spawn.ts`) so that
 * killing one takes down anything it backgrounded. The cost is that they no
 * longer die with us by accident — only `killAll` reaps them — so a signal
 * that ends this process has to run it first, or quitting the app leaks every
 * engine still attached to a socket.
 */
const live = new Set<EngineSupervisor>();

let sweeping = false;
function sweep(): void {
  if (sweeping) return;
  sweeping = true;
  for (const supervisor of live) supervisor.killAll();
  live.clear();
}

process.on("exit", sweep);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    sweep();
    process.exit(0);
  });
}

// Standalone entry: pnpm -F desktop server
const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  startAcpServer({ projectDir: process.env.PROJECT_DIR ?? process.cwd() }).catch(
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
