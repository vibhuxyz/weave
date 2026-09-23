import type { AuthMethod } from "@weave/protocol";
import { resolveCodexCliEntry, type EngineDescriptor } from "../engines/index.ts";

function getAgyFallbackAuth(): AuthMethod[] {
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

function getClaudeFallbackAuth(): AuthMethod[] {
  return [
    {
      id: "claude-ai-login",
      name: "Claude Subscription",
      type: "terminal",
      description: "Use Claude subscription",
      args: ["--cli", "auth", "login", "--claudeai"],
    } as unknown as AuthMethod,
    {
      id: "console-login",
      name: "Anthropic Console",
      type: "terminal",
      description: "Use Anthropic Console (API usage billing)",
      args: ["--cli", "auth", "login", "--console"],
    } as unknown as AuthMethod,
  ];
}

function buildCodexAuthMethod(
  id: string,
  name: string,
  description: string,
  command: string,
  args: string[],
  label: string,
): AuthMethod {
  return {
    id,
    name,
    type: "terminal",
    description,
    _meta: {
      "terminal-auth": {
        command,
        args,
        label,
      },
    },
  } as unknown as AuthMethod;
}

function getCodexFallbackAuth(engine: EngineDescriptor): AuthMethod[] {
  const codexCli = resolveCodexCliEntry(engine);
  const isNative = !codexCli.endsWith(".js");
  const cmd = isNative ? codexCli : process.execPath;
  const base = isNative ? [] : [codexCli];

  return [
    buildCodexAuthMethod(
      "chat-gpt-device-code",
      "Sign in with Device Code",
      "Sign in using one-time verification code (recommended)",
      cmd,
      [...base, "login", "--device-auth"],
      "ChatGPT Device Auth",
    ),
    buildCodexAuthMethod(
      "chat-gpt",
      "Sign in with Browser",
      "Sign in using your OpenAI ChatGPT account in browser",
      cmd,
      [...base, "login"],
      "ChatGPT Login",
    ),
    buildCodexAuthMethod(
      "api-key",
      "OpenAI API Key",
      "Authenticate using an OpenAI API Key",
      cmd,
      [...base, "login", "--with-api-key"],
      "OpenAI API Key Login",
    ),
  ];
}

export function resolveFallbackAuthMethods(
  error: unknown,
  engine: EngineDescriptor,
  initialMethods: AuthMethod[],
): AuthMethod[] {
  const errorData = (error as { data?: { authMethods?: AuthMethod[] } })?.data;
  const methods = errorData?.authMethods ?? initialMethods;
  if (methods.length > 0) return methods;

  if (engine.id === "agy" || engine.id === "antigravity") {
    return getAgyFallbackAuth();
  }
  if (engine.id === "claude-code") {
    return getClaudeFallbackAuth();
  }
  if (engine.id === "codex") {
    return getCodexFallbackAuth(engine);
  }
  return methods;
}
