import {
  ENGINES,
  isTerminalMethod,
  resolveCodexCliEntry,
} from "@weave/agent";
import type { AuthMethod } from "@weave/protocol";

function buildCodexCommand(codexCli: string): {
  readonly command: string;
  readonly baseArgs: readonly string[];
} {
  const isNative = !codexCli.endsWith(".js");
  const command = isNative ? codexCli : process.execPath;
  const baseArgs = isNative ? [] : [codexCli];
  return { command, baseArgs };
}

export function patchCodexTerminalMethod(
  method: AuthMethod,
  engineId: string,
): AuthMethod {
  if (engineId !== "codex" || isTerminalMethod(method)) return method;
  const engine = ENGINES["codex"];
  if (!engine) return method;

  const codexCli = resolveCodexCliEntry(engine);
  const { command, baseArgs } = buildCodexCommand(codexCli);

  if (method.id === "chat-gpt" || method.id === "chat-gpt-device-code") {
    return {
      ...method,
      type: "terminal",
      _meta: {
        "terminal-auth": {
          command,
          args: [...baseArgs, "login", "--device-auth"],
          label: method.id === "chat-gpt" ? "ChatGPT Login" : "ChatGPT Device Auth",
        },
      },
    } as unknown as AuthMethod;
  }

  if (method.id === "api-key") {
    return {
      ...method,
      type: "terminal",
      _meta: {
        "terminal-auth": {
          command,
          args: [...baseArgs, "login", "--with-api-key"],
          label: "OpenAI API Key Login",
        },
      },
    } as unknown as AuthMethod;
  }

  return method;
}
