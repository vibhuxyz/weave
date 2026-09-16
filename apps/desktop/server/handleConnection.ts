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
import { DesktopSessionManager } from "./sessionManager.ts";
import {
  registerLiveSupervisor,
  unregisterLiveSupervisor,
} from "./processCleanup.ts";
import { dispatchClientMessage } from "./dispatchClientMessage.ts";
import type { ActiveAuthSession } from "./authHandler.ts";
import type { ClientMessage, ServerMessage } from "./server.types.ts";

function safeSend(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function loadEnvFiles(projectDir: string): void {
  try {
    process.loadEnvFile(resolve(projectDir, ".env"));
  } catch {}
  try {
    process.loadEnvFile(resolve(projectDir, ".env.local"));
  } catch {}
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
    send({
      type: "engines",
      engines: unique.map((e) => ({
        id: e.id,
        label: e.label,
        installed: installed.has(e.id),
      })),
    });
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
    send({
      type: "chats",
      chats: (await conversations.list()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
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

  const ruleCatalog = formatRulesBlock(await discoverRules(projectDir));
  const builtinSkillCatalog = formatBuiltinSkillsBlock(BUILTIN_SKILLS);
  const skillCatalog = formatSkillCatalog(await discoverSkills(projectDir));

  const resumeId = await store.get(projectDir);
  try {
    await sessionMgr.openFirstUsableEngine(initialEngineId, resumeId);
  } catch (err) {
    if (!sessionMgr.handleAuthError(err, initialEngineId)) throw err;
  }

  if (sessionMgr.supervisor) {
    registerLiveSupervisor(sessionMgr.supervisor);
  }
  void sendChats();

  let authSession: ActiveAuthSession | null = null;
  const publishAuth = (patch: Partial<ActiveAuthSession["operation"]>) => {
    if (!authSession) return;
    authSession.operation = { ...authSession.operation, ...patch };
    send({ type: "auth-state", operation: authSession.operation });
  };

  let pendingPromise: Promise<unknown> = Promise.resolve();
  const queueTask = (taskFn: () => Promise<unknown>) => {
    pendingPromise = pendingPromise.then(taskFn);
  };

  socket.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send({ type: "error", message: "Malformed message" });
      return;
    }

    dispatchClientMessage(
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
