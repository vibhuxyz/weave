import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AuthMethod, SessionConfigOption, Usage } from "@weave/protocol";
import { isAuthRequiredError } from "@weave/protocol";
import { spawnAgent, type SpawnedAgent } from "../spawn/index.ts";
import { confineToTaskDir } from "../permissions/index.ts";
import { SessionClient } from "./client.ts";
import { AuthRequiredError } from "./errors.ts";
import { resolveFallbackAuthMethods } from "./fallback-auth.ts";
import type {
  AgentSession,
  OpenSessionOptions,
  PromptBlock,
} from "./types.ts";

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
): Promise<{ sessionId: string; configOptions: SessionConfigOption[] } | null> {
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
): Promise<{ sessionId: string; configOptions: SessionConfigOption[] }> {
  try {
    const created = await connection.newSession({
      cwd,
      mcpServers: [],
    });
    return {
      sessionId: created.sessionId,
      configOptions: created.configOptions ?? [],
    };
  } catch (error) {
    if (isAuthRequiredError(error)) {
      const methods = resolveFallbackAuthMethods(error, spawned.engine, authMethods);
      throw new AuthRequiredError(spawned.engine.id, methods, error);
    }
    throw error;
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

  const client = new SessionClient(task, sink, policy);
  const connection = createClientConnection(spawned, client);

  const init = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      auth: { terminal: true },
      elicitation: { url: {} },
      _meta: { "terminal-auth": true },
    },
  });
  sink.onCapabilities(init.agentCapabilities);

  const authMethods = init.authMethods ?? [];
  const canLoadSession = init.agentCapabilities?.loadSession === true;

  let sessionId = "";
  let configOptions: SessionConfigOption[] = [];
  let resumed = false;

  if (canLoadSession && options.resumeSessionId) {
    const loaded = await tryResume(connection, client, options.resumeSessionId, task.cwd);
    if (loaded) {
      sessionId = loaded.sessionId;
      configOptions = loaded.configOptions;
      resumed = true;
    }
  }

  if (!resumed) {
    try {
      const created = await tryCreateSession(connection, spawned, task.cwd, authMethods);
      sessionId = created.sessionId;
      configOptions = created.configOptions;
    } catch (error) {
      spawned.stop();
      throw error;
    }
  }

  sink.onSession(sessionId, resumed, configOptions);

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
    get authMethods() {
      return authMethods;
    },
    async authenticate(methodId: string) {
      await connection.authenticate({ methodId });
    },
    async prompt(blocks: PromptBlock[]) {
      const result = await connection.prompt({ sessionId, prompt: blocks });
      return { stopReason: result.stopReason, usage: result.usage };
    },
    async cancel() {
      await connection.cancel({ sessionId });
    },
    async setConfigOption(configId: string, value: string) {
      await connection.setSessionConfigOption({ sessionId, configId, value });
    },
    async newSession() {
      const created = await tryCreateSession(connection, spawned, task.cwd, authMethods);
      sessionId = created.sessionId;
      resumed = false;
      return sessionId;
    },
    async resumeSession(id: string) {
      if (!canLoadSession) return false;
      const loaded = await tryResume(connection, client, id, task.cwd);
      if (!loaded) return false;
      sessionId = loaded.sessionId;
      configOptions = loaded.configOptions;
      resumed = true;
      return true;
    },
    filesWritten: () => [...client.written],
    close() {
      void connection
        .cancel({ sessionId })
        .catch(() => {})
        .finally(() => spawned.stop());
    },
  };
}
