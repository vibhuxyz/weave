import { resolve } from "node:path";
import type { WebSocket } from "ws";
import { ENGINES, DEFAULT_ENGINE_ID, installedEngines } from "@weave/agent";
import {
  Ledger,
  ConversationStore,
  TasksStore,
  weaveDirFor,
  newRunId,
  discoverSkills,
  formatSkillCatalog,
  discoverRules,
  formatRulesBlock,
  BUILTIN_SKILLS,
  formatBuiltinSkillsBlock,
  resolveCatalog,
  type SessionStore,
  type NormalizedPlugin,
} from "@weave/core";
import type { TaskContract, AuthMethod } from "@weave/protocol";
import { DesktopSessionManager, registerLiveSupervisor, unregisterLiveSupervisor } from "../session/index.ts";
import { handleClientMessage } from "./dispatch.ts";
import type { ActiveAuthSession } from "../auth/index.ts";
import type { ClientMessage, ServerMessage, EngineEntry } from "../shared/index.ts";

function safeSend(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function isExpectedEnvError(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error as { code: unknown }).code === "ENOENT";
}

function loadEnvFiles(projectDir: string): void {
  for (const name of [".env", ".env.local"] as const) {
    try {
      process.loadEnvFile(resolve(projectDir, name));
    } catch (error: unknown) {
      if (!isExpectedEnvError(error)) throw error;
    }
  }
}

const KNOWN_CLIENT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "prompt",
  "cancel",
  "set-config",
  "git",
  "new-chat",
  "open-chat",
  "switch-engine",
  "start-auth",
  "cancel-auth",
  "list-files",
  "read-attachment",
  "refresh-engines",
  "refresh-plugins",
]);

function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !KNOWN_CLIENT_MESSAGE_TYPES.has(type)) return null;
  return raw as ClientMessage;
}

export async function handleConnection(
  socket: WebSocket,
  projectDir: string,
  store: SessionStore,
): Promise<void> {
  loadEnvFiles(projectDir);

  const send = (msg: ServerMessage) => safeSend(socket, msg);
  const ledger = new Ledger(weaveDirFor(projectDir), newRunId());
  const continuationTaskId = ledger.runId;
  const isSandboxed =
    process.env.WEAVE_SANDBOX === "1" || process.env.SANDBOXED === "true";

  const task: TaskContract = {
    id: "desktop",
    prompt: "",
    cwd: projectDir,
    sandboxed: isSandboxed,
  };

  ledger.append("run.started", { cwd: projectDir, config: { via: "desktop" } });

  const sendEngineList = () => {
    const installed = new Set(installedEngines().map((e) => e.id));
    const unique = Array.from(
      new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
    );
    const engines: EngineEntry[] = unique.map((e) => ({
      id: e.id,
      label: e.label,
      installed: installed.has(e.id),
    }));
    send({ type: "engines", engines });
  };

  let pluginCatalog: NormalizedPlugin[] = [];
  let pluginsById = new Map<string, NormalizedPlugin>();
  const loadPlugins = async () => {
    pluginCatalog = await resolveCatalog();
    pluginsById = new Map(pluginCatalog.map((p) => [p.id, p]));
    send({ type: "plugin-catalog", plugins: pluginCatalog });
  };
  await loadPlugins();

  const conversations = new ConversationStore(weaveDirFor(projectDir));
  const tasksStore = new TasksStore(weaveDirFor(projectDir));
  const authMethodsByEngine = new Map<string, AuthMethod[]>();

  const sendChats = async () => {
    const chatList = await conversations.list();
    send({
      type: "chats",
      chats: chatList.sort((a, b) => b.updatedAt - a.updatedAt),
      activeSessionId: sessionMgr.supervisor?.current?.sessionId ?? "",
    });
  };

  const initialEngineId = process.env.ENGINE_ID || DEFAULT_ENGINE_ID;
  const sessionMgr = new DesktopSessionManager(initialEngineId, {
    projectDir,
    task,
    store,
    tasksStore,
    ledger,
    continuationTaskId,
    send,
    sendChats,
    authMethodsByEngine,
  });

  const [ruleCatalog, builtinSkillCatalog, skillCatalog] = await Promise.all([
    discoverRules(projectDir).then(formatRulesBlock),
    Promise.resolve(formatBuiltinSkillsBlock(BUILTIN_SKILLS)),
    discoverSkills(projectDir).then(formatSkillCatalog),
  ]);

  const resumeId = await store.get(projectDir);
  try {
    await sessionMgr.openFirstUsableEngine(initialEngineId, resumeId);
  } catch (err) {
    if (!sessionMgr.handleAuthError(err, initialEngineId)) throw err;
  }

  if (sessionMgr.supervisor) {
    registerLiveSupervisor(sessionMgr.supervisor);
  }
  sendEngineList();
  sendChats().catch((error: unknown) => {
    console.error(JSON.stringify({
      level: "error",
      component: "desktop-acp-server",
      message: "Initial chat list failed",
      detail: error instanceof Error ? error.message : String(error),
    }));
  });

  let authSession: ActiveAuthSession | null = null;
  const publishAuth = (patch: Partial<ActiveAuthSession["operation"]>) => {
    if (!authSession) return;
    authSession.operation = { ...authSession.operation, ...patch };
    send({ type: "auth-state", operation: authSession.operation });
  };

  let pendingPromise: Promise<unknown> = Promise.resolve();
  const queueTask = (taskFn: () => Promise<unknown>) => {
    pendingPromise = pendingPromise.then(taskFn).catch((err) => {
      console.error("[task-queue-error]", err);
    });
  };

  socket.on("message", (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      send({ type: "error", message: "Malformed message" });
      return;
    }
    const msg = parseClientMessage(parsed);
    if (!msg) {
      send({ type: "error", message: "Malformed message" });
      return;
    }

    handleClientMessage(
      msg,
      {
        sessionMgr,
        projectDir,
        store,
        tasksStore,
        conversations,
        ledger,
        continuationTaskId,
        ruleCatalog,
        builtinSkillCatalog,
        skillCatalog,
        pluginsById,
        authMethodsByEngine,
        send,
        sendChats,
        sendEngineList,
        loadPlugins,
        getAuthSession: () => authSession,
        setAuthSession: (s) => {
          authSession = s;
        },
        publishAuth,
      },
      queueTask,
    );
  });

  socket.on("close", () => {
    ledger.append("run.finished", { status: "ok", wallMs: 0 });
    authSession?.abort.abort();
    if (sessionMgr.supervisor) {
      unregisterLiveSupervisor(sessionMgr.supervisor);
      sessionMgr.supervisor.killAll();
    }
  });
}
