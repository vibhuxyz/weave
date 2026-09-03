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

import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { confineToTaskDir, openSession, getEngine, DEFAULT_ENGINE_ID, type AgentSession } from "@weave/agent";
import {
  Ledger,
  SessionStore,
  ConversationStore,
  titleFromPrompt,
  weaveDirFor,
  newRunId,
  readGitStatus,
  type ConversationMeta,
  type GitStatus,
} from "@weave/core";
import type {
  SessionConfigOption,
  SessionUpdate,
  TaskContract,
} from "@weave/protocol";

export const DEFAULT_PORT = 8137;
export type { GitStatus, GitChange, ConversationMeta } from "@weave/core";

/** Messages the UI sends us. */
export type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "cancel" }
  | { type: "set-config"; configId: string; value: string }
  | { type: "git" }
  | { type: "new-chat" }
  | { type: "open-chat"; sessionId: string };

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
  /** The chat list for this project, newest activity first. */
  | { type: "chats"; chats: ConversationMeta[]; activeSessionId: string | null }
  /** Wipe the transcript — sent right before a different chat replays. */
  | { type: "reset" };

export interface AcpServerHandle {
  port: number;
  close(): Promise<void>;
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
  const task: TaskContract = {
    id: "desktop",
    prompt: "",
    cwd: projectDir,
  };

  ledger.append("run.started", { cwd: projectDir, config: { via: "desktop" } });

  const conversations = new ConversationStore(weaveDirFor(projectDir));
  const resumeId = await store.get(projectDir);
  let persisted = false;

  const sendChats = async () =>
    send({
      type: "chats",
      chats: (await conversations.list()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
      activeSessionId: session.sessionId,
    });

  const engineId = process.env.ENGINE_ID || DEFAULT_ENGINE_ID;

  const session: AgentSession = await openSession({
    task,
    policy: confineToTaskDir,
    resumeSessionId: resumeId,
    engineId,
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
        send({
          type: "ready",
          sessionId,
          cwd: projectDir,
          engineId,
          engineLabel: getEngine(engineId).label,
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
  });

  console.log(
    "[session]",
    session.sessionId,
    session.resumed ? "(resumed)" : "(new)",
    `config: ${session.configOptions.map((option) => option.id).join(", ") || "none"}`,
  );

  void sendChats();

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
        void session.cancel();
        return;

      case "git":
        void readGitStatus(projectDir).then((git) =>
          send({ type: "git-status", git }),
        );
        return;

      case "set-config":
        session
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

      case "new-chat":
        pending = pending
          .then(() => session.newSession())
          .then(async (sessionId) => {
            persisted = false;
            send({ type: "reset" });
            send({
              type: "ready",
              sessionId,
              cwd: projectDir,
              engineId,
              engineLabel: getEngine(engineId).label,
              configOptions: session.configOptions,
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

      case "open-chat": {
        const wanted = message.sessionId;
        if (wanted === session.sessionId) return;
        pending = pending
          .then(async () => {
            send({ type: "reset" });
            const ok = await session.resumeSession(wanted);
            if (!ok) {
              send({ type: "error", message: "Could not open that chat." });
              await sendChats();
              return;
            }
            persisted = true;
            await store.set(projectDir, session.sessionId);
            send({
              type: "ready",
              sessionId: session.sessionId,
              cwd: projectDir,
              engineId,
              engineLabel: getEngine(engineId).label,
              configOptions: session.configOptions,
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
        pending = pending
          .then(() => session.prompt(promptText))
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
              await store.set(projectDir, session.sessionId);
            }
            // Title is filled from the first prompt; later turns only bump
            // `updatedAt` so the chat floats to the top of the list.
            await conversations.record(
              session.sessionId,
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
    session.close();
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
