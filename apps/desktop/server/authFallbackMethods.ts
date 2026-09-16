import {
  ENGINES,
  getEngine,
  resolveEngineEntry,
  resolveCodexCliEntry,
  isTerminalMethod,
} from "@weave/agent";
import type { AuthMethod } from "@weave/protocol";

export function resolveEngineFallbackMethods(
  engineId: string,
  initialMethods: readonly AuthMethod[],
): AuthMethod[] {
  const methods = [...initialMethods];

  if (methods.length === 0) {
    if (engineId === "antigravity" || engineId === "agy") {
      methods.push({
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
        methods.push(
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

  if (engineId === "codex") {
    const codexCli = resolveCodexCliEntry(getEngine("codex"));
    const isNative = !codexCli.endsWith(".js");
    const cmd = isNative ? codexCli : process.execPath;
    const baseArgs = isNative ? [] : [codexCli];

    if (!methods.some((m) => m.id === "chat-gpt-device-code")) {
      methods.unshift({
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
    if (!methods.some((m) => m.id === "chat-gpt" || m.id === "codex-login")) {
      methods.push({
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
    if (!methods.some((m) => m.id === "api-key")) {
      methods.push({
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

  return methods;
}

export function patchCodexTerminalMethod(method: AuthMethod, engineId: string): AuthMethod {
  if (engineId !== "codex" || isTerminalMethod(method)) return method;
  const engine = ENGINES["codex"];
  if (!engine) return method;

  const codexCli = resolveCodexCliEntry(engine);
  const isNative = !codexCli.endsWith(".js");
  const cmd = isNative ? codexCli : process.execPath;
  const baseArgs = isNative ? [] : [codexCli];

  if (method.id === "chat-gpt" || method.id === "chat-gpt-device-code") {
    return {
      ...method,
      type: "terminal",
      _meta: {
        "terminal-auth": {
          command: cmd,
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
          command: cmd,
          args: [...baseArgs, "login", "--with-api-key"],
          label: "OpenAI API Key Login",
        },
      },
    } as unknown as AuthMethod;
  }

  return method;
}
