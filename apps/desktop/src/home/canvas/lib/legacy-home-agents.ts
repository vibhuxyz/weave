const LEGACY_HOME_AGENT_IDS: Record<string, string> = {
  "builtin:generalist": "frontend-engineer",
  "builtin:reviewer": "qa-engineer",
  "builtin:craftsman": "devops-engineer",
  "builtin:builder": "builder",
  "builtin:committer": "committer",
  "builtin:debugger": "debugger",
};

export function legacyHomeAgentId(agentId: string): string | null {
  return LEGACY_HOME_AGENT_IDS[agentId] ?? null;
}
