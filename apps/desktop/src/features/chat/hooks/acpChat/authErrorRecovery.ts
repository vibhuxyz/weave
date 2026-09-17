import type { EngineAuthMethod } from "@weave/protocol";

export function engineLabelFallback(engineId: string): string {
  if (engineId === "claude-code") return "Claude Code";
  if (engineId === "codex") return "Codex";
  return "Google Antigravity";
}

export function authMethodsForEngine(engineId: string): EngineAuthMethod[] {
  if (engineId === "claude-code") {
    return [
      {
        id: "claude-ai-login",
        name: "Claude Subscription",
        description: "Use Claude subscription",
        kind: "terminal",
      },
      {
        id: "console-login",
        name: "Anthropic Console",
        description: "Use Anthropic Console (API usage billing)",
        kind: "terminal",
      },
    ];
  }

  if (engineId === "codex") {
    return [
      {
        id: "chat-gpt-device-code",
        name: "Sign in with Device Code",
        description: "Sign in using one-time verification code (recommended)",
        kind: "terminal",
      },
      {
        id: "chat-gpt",
        name: "Sign in with Browser",
        description: "Sign in using your OpenAI ChatGPT account in browser",
        kind: "terminal",
      },
      {
        id: "api-key",
        name: "OpenAI API Key",
        description: "Authenticate using an OpenAI API Key",
        kind: "terminal",
      },
    ];
  }

  return [
    {
      id: "agy-login",
      name: "Sign in with Google Antigravity",
      description: "Runs `agy auth login` to authenticate",
      kind: "terminal",
    },
  ];
}
