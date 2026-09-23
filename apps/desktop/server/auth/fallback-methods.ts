import {
  ENGINES,
  getEngine,
  resolveEngineEntry,
  resolveCodexCliEntry,
} from "@weave/agent";
import type { AuthMethod } from "@weave/protocol";

function createAntigravityFallback(): readonly AuthMethod[] {
  return [
    {
      id: "agy-login",
      name: "Sign in with Google Antigravity",
      type: "terminal",
      description: "Sign in with Google AI Pro or an API key",
      args: ["--login"],
    } as unknown as AuthMethod,
  ];
}

function createClaudeCodeFallbacks(): readonly AuthMethod[] {
  const engine = ENGINES["claude-code"];
  if (!engine) return [];
  const entry = resolveEngineEntry(engine);
  return [
    {
      id: "claude-ai-login",
      name: "Claude Subscription",
      type: "terminal",
      description: "Use Claude subscription",
      args: ["--cli", "auth", "login", "--claudeai"],
      _meta: {
        "terminal-auth": {
          command: process.execPath,
          args: [entry, "--cli", "auth", "login", "--claudeai"],
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
          args: [entry, "--cli", "auth", "login", "--console"],
          label: "Anthropic Console Login",
        },
      },
    } as unknown as AuthMethod,
  ];
}

function createCodexFallbacks(
  existingMethods: readonly AuthMethod[],
): readonly AuthMethod[] {
  const codexCli = resolveCodexCliEntry(getEngine("codex"));
  const isNative = !codexCli.endsWith(".js");
  const command = isNative ? codexCli : process.execPath;
  const baseArgs = isNative ? [] : [codexCli];
  const additions: AuthMethod[] = [];

  if (!existingMethods.some((m) => m.id === "chat-gpt-device-code")) {
    additions.push({
      id: "chat-gpt-device-code",
      name: "Sign in with Device Code",
      type: "terminal",
      description: "Sign in using one-time verification code in browser (recommended)",
      _meta: {
        "terminal-auth": {
          command,
          args: [...baseArgs, "login", "--device-auth"],
          label: "ChatGPT Device Auth",
        },
      },
    } as unknown as AuthMethod);
  }

  if (!existingMethods.some((m) => m.id === "chat-gpt" || m.id === "codex-login")) {
    additions.push({
      id: "chat-gpt",
      name: "Sign in with ChatGPT",
      type: "terminal",
      description: "Sign in using your OpenAI ChatGPT account",
      _meta: {
        "terminal-auth": {
          command,
          args: [...baseArgs, "login"],
          label: "ChatGPT Login",
        },
      },
    } as unknown as AuthMethod);
  }

  if (!existingMethods.some((m) => m.id === "api-key")) {
    additions.push({
      id: "api-key",
      name: "OpenAI API Key",
      type: "terminal",
      description: "Authenticate using an OpenAI API Key",
      _meta: {
        "terminal-auth": {
          command,
          args: [...baseArgs, "login", "--with-api-key"],
          label: "OpenAI API Key Login",
        },
      },
    } as unknown as AuthMethod);
  }

  return additions;
}

export function resolveEngineFallbackMethods(
  engineId: string,
  initialMethods: readonly AuthMethod[],
): AuthMethod[] {
  if (initialMethods.length === 0) {
    if (engineId === "antigravity" || engineId === "agy") {
      return [...createAntigravityFallback()];
    }
    if (engineId === "claude-code") {
      return [...createClaudeCodeFallbacks()];
    }
  }

  if (engineId === "codex") {
    const codexExtras = createCodexFallbacks(initialMethods);
    const deviceCodeMethod = codexExtras.find((m) => m.id === "chat-gpt-device-code");
    const otherCodexMethods = codexExtras.filter((m) => m.id !== "chat-gpt-device-code");
    const result: AuthMethod[] = [];
    if (deviceCodeMethod) result.push(deviceCodeMethod);
    result.push(...initialMethods);
    result.push(...otherCodexMethods);
    return result;
  }

  return [...initialMethods];
}
