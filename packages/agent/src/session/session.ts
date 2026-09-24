import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AuthMethod, SessionConfigOption, Usage } from "@weave/protocol";
import { isAuthRequiredError } from "@weave/protocol";
import { spawnAgent, type SpawnedAgent } from "../spawn/index.ts";
import { confineToTaskDir, type PermissionPolicy } from "../permissions/index.ts";
import { SessionClient } from "./client.ts";
import { AuthRequiredError, EngineStalledError } from "./errors.ts";
import { resolveFallbackAuthMethods } from "./fallback-auth.ts";
import { asEngineFailure } from "./engine-failure.ts";
import { createStallWatchdog } from "./stall-watchdog.ts";
import { toSessionModes, withCurrentMode, type SessionModes } from "./modes.ts";
import type {
  AgentSession,
  OpenSessionOptions,
  SessionSink,
  PromptBlock,
  PromptOptions,
  QuestionAsker,
} from "./types.ts";

/**
 * How long a turn may produce no protocol traffic at all before the engine is
 * treated as wedged. Long commands keep the countdown alive through their tool
 * output, so this only fires on true silence.
 */
export const DEFAULT_STALL_TIMEOUT_MS = 180_000;

/** Every sink callback is engine activity, so route them all through `touch`. */
function watchedSink(sink: SessionSink, touch: () => void): SessionSink {
  return {
    onUpdate: (update, replay, sessionId) => { touch(); sink.onUpdate(update, replay, sessionId); },
    onPermission: (toolCall, options, decision) => { touch(); sink.onPermission(toolCall, options, decision); },
    onFileRead: (path) => { touch(); sink.onFileRead(path); },
    onFileWritten: (path, bytes) => { touch(); sink.onFileWritten(path, bytes); },
    onSpawned: (pid, entry) => sink.onSpawned(pid, entry),
    onSession: (id, resumed, options, modes) => { touch(); sink.onSession(id, resumed, options, modes); },
    onCapabilities: (capabilities) => sink.onCapabilities(capabilities),
  };
}

function createClientConnection(
  spawned: SpawnedAgent,
  client: SessionClient,
): acp.ClientSideConnection {
  const stdin = spawned.child.stdin;
  const stdout = spawned.child.stdout;
  if (!stdin || !stdout) {
    throw new Error("Spawned agent process missing stdin or stdout stream");
  }

  const stream = acp.ndJsonStream(
    Writable.toWeb(stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(stdout) as ReadableStream<Uint8Array>,
  );
  return new acp.ClientSideConnection(() => client, stream);
}

async function tryResume(
  connection: acp.ClientSideConnection,
  client: SessionClient,
  sessionId: string,
  cwd: string,
): Promise<{ sessionId: string; configOptions: SessionConfigOption[]; modes: SessionModes | null } | null> {
  try {
    client.replaying = true;
    const loaded = await connection.loadSession({
      sessionId,
      cwd,
      mcpServers: [],
    });
    return {
      sessionId,
      configOptions: loaded.configOptions ?? [],
      modes: toSessionModes(loaded.modes),
    };
  } catch {
    return null;
  } finally {
    client.replaying = false;
  }
}

async function tryCreateSession(
  connection: acp.ClientSideConnection,
  spawned: SpawnedAgent,
  cwd: string,
  authMethods: AuthMethod[],
): Promise<{ sessionId: string; configOptions: SessionConfigOption[]; modes: SessionModes | null }> {
  try {
    const created = await connection.newSession({
      cwd,
      mcpServers: [],
    });
    return {
      sessionId: created.sessionId,
      configOptions: created.configOptions ?? [],
      modes: toSessionModes(created.modes),
    };
  } catch (error) {
    if (isAuthRequiredError(error)) {
      const methods = resolveFallbackAuthMethods(error, spawned.engine, authMethods);
      throw new AuthRequiredError(spawned.engine.id, methods, error);
    }
    throw error;
  }
}

/**
 * Run a startup step, reporting an engine that died during it as the crash it
 * was rather than as the transport error the SDK surfaces.
 */
async function startHandshake<T>(spawned: SpawnedAgent, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    throw await asEngineFailure(spawned, error);
  }
}

export async function openSession(
  options: OpenSessionOptions,
): Promise<AgentSession> {
  const { task, sink } = options;
  const policy = options.policy ?? confineToTaskDir;
  const isSandboxed = options.sandboxed ?? options.task.sandboxed ?? false;

  const spawned = spawnAgent(task.cwd, options.engineId, { sandboxed: isSandboxed });
  sink.onSpawned(spawned.child.pid ?? -1, spawned.entry);

  let alive = true;
  const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  const watchdog = createStallWatchdog({
    timeoutMs: stallTimeoutMs,
    onStall: (timedOutAfterMs) => {
      alive = false;
      spawned.stop(0);
      return new EngineStalledError(spawned.engine.id, spawned.engine.label, timedOutAfterMs);
    },
  });

  // A permission request is the one place a turn can go quiet on purpose:
  // the policy may be sitting in front of a human. Hold the countdown for it.
  const watchedPolicy: PermissionPolicy = async (contract, request) => {
    watchdog.pause();
    try {
      return await policy(contract, request);
    } finally {
      watchdog.resume();
    }
  };

  const askUser = options.askUser;
  const watchedAskUser: QuestionAsker | undefined = askUser && (async (request) => {
    watchdog.pause();
    try {
      return await askUser(request);
    } finally {
      watchdog.resume();
    }
  });

  const client = new SessionClient({
    task,
    sink: watchedSink(sink, watchdog.touch),
    policy: watchedPolicy,
    askUser: watchedAskUser,
  });
  const connection = createClientConnection(spawned, client);

  const init = await startHandshake(spawned, () => connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      auth: { terminal: true },
      elicitation: watchedAskUser ? { form: {}, url: {} } : { url: {} },
      _meta: { "terminal-auth": true },
    },
  }));
  sink.onCapabilities(init.agentCapabilities);

  const authMethods = init.authMethods ?? [];
  const canLoadSession = init.agentCapabilities?.loadSession === true;

  let sessionId = "";
  let configOptions: SessionConfigOption[] = [];
  let modes: SessionModes | null = null;
  let resumed = false;

  if (canLoadSession && options.resumeSessionId) {
    const loaded = await tryResume(connection, client, options.resumeSessionId, task.cwd);
    if (loaded) {
      sessionId = loaded.sessionId;
      configOptions = loaded.configOptions;
      modes = loaded.modes;
      resumed = true;
    }
  }

  if (!resumed) {
    try {
      const created = await startHandshake(spawned, () =>
        tryCreateSession(connection, spawned, task.cwd, authMethods),
      );
      sessionId = created.sessionId;
      configOptions = created.configOptions;
      modes = created.modes;
    } catch (error) {
      spawned.stop();
      throw error;
    }
  }

  sink.onSession(sessionId, resumed, configOptions, modes);

  return {
    engineId: spawned.engine.id,
    get sessionId() {
      return sessionId;
    },
    get resumed() {
      return resumed;
    },
    get configOptions() {
      return configOptions;
    },
    get modes() {
      return modes;
    },
    async setMode(modeId: string) {
      await connection.setSessionMode({ sessionId, modeId });
      modes = withCurrentMode(modes, modeId);
    },
    get authMethods() {
      return authMethods;
    },
    async authenticate(methodId: string) {
      await connection.authenticate({ methodId });
    },
    async prompt(blocks: PromptBlock[], promptOptions?: PromptOptions) {
      if (!alive) throw new EngineStalledError(spawned.engine.id, spawned.engine.label, stallTimeoutMs);
      if (stallTimeoutMs <= 0) {
        const result = await connection.prompt({ sessionId, prompt: blocks });
        return { stopReason: result.stopReason, usage: result.usage };
      }
      const inflight = connection.prompt({ sessionId, prompt: blocks });
      // Killing the engine makes the SDK reject every pending request. When the
      // watchdog wins the race nobody is left awaiting this one, and an
      // unhandled rejection would take the whole server down with it.
      inflight.catch(() => {});
      try {
        const result = await Promise.race([inflight, watchdog.arm(promptOptions?.stallTimeoutMs)]);
        return { stopReason: result.stopReason, usage: result.usage };
      } finally {
        watchdog.disarm();
      }
    },
    async cancel() {
      watchdog.disarm();
      await connection.cancel({ sessionId });
    },
    async setConfigOption(configId: string, value: string) {
      await connection.setSessionConfigOption({ sessionId, configId, value });
    },
    async newSession() {
      const created = await tryCreateSession(connection, spawned, task.cwd, authMethods);
      sessionId = created.sessionId;
      configOptions = created.configOptions;
      modes = created.modes;
      resumed = false;
      return sessionId;
    },
    async resumeSession(id: string) {
      if (!canLoadSession) return false;
      const loaded = await tryResume(connection, client, id, task.cwd);
      if (!loaded) return false;
      sessionId = loaded.sessionId;
      configOptions = loaded.configOptions;
      modes = loaded.modes;
      resumed = true;
      return true;
    },
    filesWritten: () => [...client.written],
    get alive() {
      return alive;
    },
    close() {
      watchdog.disarm();
      // A killed engine has no stdin left to cancel through; writing to it
      // only produces ERR_STREAM_WRITE_AFTER_END noise.
      if (!alive || spawned.exitInfo().exited) {
        alive = false;
        spawned.stop();
        return;
      }
      alive = false;
      void connection
        .cancel({ sessionId })
        .catch(() => {})
        .finally(() => spawned.stop());
    },
  };
}
