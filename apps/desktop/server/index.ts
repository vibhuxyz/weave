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

import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  confineToTaskDir,
  createEngineSupervisor,
  getEngine,
  installedEngines,
  isTerminalMethod,
  runTerminalAuth,
  AuthRequiredError,
  ENGINES,
  DEFAULT_ENGINE_ID,
} from "@weave/agent";
import {
  Ledger,
  SessionStore,
  ConversationStore,
  titleFromPrompt,
  weaveDirFor,
  newRunId,
  readGitStatus,
  discoverSkills,
  formatSkillCatalog,
  type ConversationMeta,
  type GitStatus,
} from "@weave/core";
import type {
  AuthMethod,
  EngineAuthMethod,
  EngineAuthOperation,
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
} from "@weave/protocol";
import { toEngineAuthMethod } from "@weave/protocol";

export const DEFAULT_PORT = 8137;
export type { GitStatus, GitChange, ConversationMeta } from "@weave/core";

/** Messages the UI sends us. */
export type ClientMessage =
  | { type: "prompt"; text: string; persona?: string }
  | { type: "cancel" }
  | { type: "set-config"; configId: string; value: string }
  | { type: "git" }
  | { type: "new-chat"; instructions?: string }
  | { type: "open-chat"; sessionId: string }
  /** Rebind this conversation to a different engine. */
  | { type: "switch-engine"; engineId: string }
  /** Sign in to an engine that refused a session. */
  | { type: "start-auth"; engineId: string; methodId: string }
  /** Abandon a sign-in that is still running. */
  | { type: "cancel-auth" }
  /** Fuzzy path lookup for the `@file` mention menu. */
  | { type: "list-files"; query: string };

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
  | { type: "turn-end"; stopReason: string }
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
  /** The chat list for this project, newest activity first. */
  | { type: "chats"; chats: ConversationMeta[]; activeSessionId: string | null }
  /** Project-relative paths matching a `list-files` query. */
  | { type: "files"; query: string; files: string[] }
  /** Wipe the transcript — sent right before a different chat replays. */
  | { type: "reset" };

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
  const send = (message: ServerMessage) => safeSend(socket, message);
  const ledger = new Ledger(weaveDirFor(projectDir), newRunId());
  // Instructions that ride the *next* prompt only, then clear: new-chat
  // instructions, and the carry-forward digest written on an engine switch.
  let pendingPreamble: string | null = null;

  // A running plain-text digest of the conversation, so a switch to another
  // engine can carry context the new engine's fresh session never saw.
  const transcript: { role: "user" | "assistant"; text: string }[] = [];
  const recordTurn = (role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = transcript.at(-1);
    if (last?.role === role) last.text += trimmed;
    else transcript.push({ role, text: trimmed });
    // Keep the digest bounded — the tail is what matters on a switch.
    while (transcript.length > 40) transcript.shift();
  };
  const carryForwardDigest = (): string => {
    if (transcript.length === 0) return "";
    const body = transcript
      .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
      .join("\n\n");
    return [
      "<prior-conversation>",
      "This conversation continues from another agent. Earlier turns:",
      "",
      body,
      "</prior-conversation>",
    ].join("\n");
  };

  // Skills are a property of the repo; discover them once per connection.
  const skillCatalog = formatSkillCatalog(await discoverSkills(projectDir));

  const task: TaskContract = {
    id: "desktop",
    prompt: "",
    cwd: projectDir,
  };

  ledger.append("run.started", { cwd: projectDir, config: { via: "desktop" } });

  const installed = new Set(installedEngines().map((e) => e.id));
  send({
    type: "engines",
    engines: Object.values(ENGINES).map((e) => ({
      id: e.id,
      label: e.label,
      installed: installed.has(e.id),
    })),
  });

  const conversations = new ConversationStore(weaveDirFor(projectDir));
  const resumeId = await store.get(projectDir);
  let persisted = false;

  const sendChats = async () =>
    send({
      type: "chats",
      chats: (await conversations.list()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
      activeSessionId: supervisor.current.sessionId,
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
    authMethodsByEngine.set(error.engineId, error.authMethods);
    send({
      type: "auth-required",
      engineId: error.engineId,
      engineLabel: getEngine(error.engineId).label,
      message: error.message,
      methods: error.authMethods.map(toEngineAuthMethod),
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
      await supervisor.switchTo(engineId);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        sendAuthRequired(error);
        return false;
      }
      throw error;
    }
    currentEngineId = engineId;
    persisted = false;
    // The new engine's session never saw the conversation — carry it.
    pendingPreamble = carryForwardDigest() || null;
    ledger.append("agent.session", {
      taskId: task.id,
      sessionId: supervisor.current.sessionId,
      resumed: false,
      configOptions: supervisor.current.configOptions,
    });
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

    for (const engineId of order) {
      try {
        const opened = await createEngineSupervisor({ ...options, engineId });
        if (refusal) {
          sendAuthRequired(refusal);
          send({
            type: "error",
            message: `${getEngine(refusal.engineId).label} needs you to sign in. Using ${getEngine(engineId).label} for now.`,
          });
        }
        currentEngineId = engineId;
        return opened;
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          refusal ??= error;
          continue;
        }
        throw error;
      }
    }
    // Nothing opened. Rethrow the auth refusal rather than a generic failure,
    // so the reason survives to the caller.
    throw refusal ?? new Error("No engine could open a session.");
  };

  const supervisor = await openFirstUsableEngine(currentEngineId, {
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
        if (
          !replay &&
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          recordTurn("assistant", update.content.text);
        }
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
  });

  console.log(
    "[session]",
    supervisor.current.sessionId,
    supervisor.current.resumed ? "(resumed)" : "(new)",
    `config: ${supervisor.current.configOptions.map((o) => o.id).join(", ") || "none"}`,
  );

  void sendChats();

  /** The one system block that rides every prompt. */
  const composeSystem = (userText: string, persona?: string): string => {
    const blocks = [pendingPreamble, persona?.trim() || null, skillCatalog].filter(
      (b): b is string => !!b,
    );
    pendingPreamble = null;
    if (blocks.length === 0) return userText;
    return `<system>\n${blocks.join("\n\n")}\n</system>\n\n${userText}`;
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
        void supervisor.current.cancel();
        return;

      case "switch-engine": {
        const nextEngineId = message.engineId;
        if (nextEngineId === currentEngineId || !ENGINES[nextEngineId]) return;
        pending = pending
          // Supersede whatever is in flight on the old engine (II.13).
          .then(() => supervisor.current.cancel().catch(() => {}))
          // An auth refusal is reported by `bindEngine` as `auth-required`,
          // not as an error — it is a state with an action, not a failure.
          .then(() => bindEngine(nextEngineId))
          .catch((error: unknown) =>
            send({
              type: "error",
              message: `Could not switch engine: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        return;
      }

      case "cancel-auth":
        auth?.abort.abort();
        return;

      case "start-auth": {
        if (auth?.operation.status === "running") return;
        const { engineId, methodId } = message;
        const engine = ENGINES[engineId];
        const method = authMethodsByEngine
          .get(engineId)
          ?.find((entry) => entry.id === methodId);
        if (!engine || !method) {
          send({ type: "error", message: "That sign-in is no longer available." });
          return;
        }

        const abort = new AbortController();
        auth = {
          abort,
          operation: {
            engineId,
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
            await supervisor.current.authenticate(methodId).catch(() => {});

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

      case "list-files": {
        const query = message.query;
        void searchProjectFiles(projectDir, query).then((files) =>
          send({ type: "files", query, files }),
        );
        return;
      }

      case "set-config":
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
        const instructions = message.instructions;
        pending = pending
          .then(() => supervisor.current.newSession())
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
              configOptions: supervisor.current.configOptions,
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
        const wanted = message.sessionId;
        pending = pending
          .then(async () => {
            send({ type: "reset" });
            const ok = await supervisor.current.resumeSession(wanted);
            if (!ok) {
              send({ type: "error", message: "Could not open that chat." });
              await sendChats();
              return;
            }
            persisted = true;
            await store.set(projectDir, supervisor.current.sessionId);
            send({
              type: "ready",
              sessionId: supervisor.current.sessionId,
              cwd: projectDir,
              engineId: currentEngineId,
              engineLabel: getEngine(currentEngineId).label,
              configOptions: supervisor.current.configOptions,
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
        const promptText = message.text;
        recordTurn("user", promptText);
        // The persona block + skills catalog + any pending preamble ride every
        // prompt as one <system> block, so nothing drifts over a conversation.
        const outgoing = composeSystem(promptText, message.persona);
        pending = pending
          .then(() => supervisor.current.prompt(outgoing))
          .then(async ({ stopReason }) => {
            send({ type: "turn-end", stopReason });
            ledger.append("task.finished", {
              taskId: task.id,
              status: "ok",
              stopReason,
              wallMs: 0,
            });

            // Now the session exists on the agent's disk and can be resumed.
            if (!persisted) {
              persisted = true;
              await store.set(projectDir, supervisor.current.sessionId);
            }
            // Title is filled from the first prompt; later turns only bump
            // `updatedAt` so the chat floats to the top of the list.
            await conversations.record(
              supervisor.current.sessionId,
              titleFromPrompt(promptText),
            );
            await sendChats();

            send({ type: "git-status", git: await readGitStatus(projectDir) });
          })
          .catch((error: unknown) => {
            const text = error instanceof Error ? error.message : String(error);
            ledger.append("error", { taskId: task.id, where: "prompt", message: text });
            send({ type: "error", message: text });
          });
        return;
      }
    }
  });

  socket.on("close", () => {
    ledger.append("run.finished", { status: "ok", wallMs: 0 });
    auth?.abort.abort();
    supervisor.killAll();
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
