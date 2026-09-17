import type { SettingsTabItem, HarnessDescriptor } from "./types";

export const SETTINGS_TABS: readonly SettingsTabItem[] = [
  { id: "appearance", label: "Appearance", iconName: "palette" },
  { id: "behavior", label: "Behavior", iconName: "sliders" },
  { id: "connections", label: "Connections", iconName: "network" },
  { id: "ai-providers", label: "AI providers", iconName: "infinity" },
  { id: "notifications", label: "Notifications", iconName: "bell" },
  { id: "keyboard-shortcuts", label: "Keyboard shortcuts", iconName: "keyboard" },
  { id: "voice", label: "Voice", iconName: "headphones" },
  { id: "archive", label: "Archive", iconName: "archive" },
  { id: "security", label: "Security & privacy", iconName: "shield" },
  { id: "system", label: "System", iconName: "cpu" },
  { id: "experiments", label: "Experiments", iconName: "flask" },
] as const;

export const DEFAULT_HARNESSES: readonly HarnessDescriptor[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    subtitle: "Anthropic's agentic coding tool",
    packageName: "@agentclientprotocol/claude-agent-acp",
    authUrl: "https://claude.ai/login",
  },
  {
    id: "codex",
    label: "Codex",
    subtitle: "OpenAI's coding agent",
    packageName: "@agentclientprotocol/codex-acp",
    authUrl: "https://auth.openai.com",
  },
  {
    id: "antigravity",
    label: "Gemini",
    subtitle: "Google DeepMind's agentic coding harness",
    packageName: "agy-acp",
    authUrl: "https://aistudio.google.com",
  },
] as const;
