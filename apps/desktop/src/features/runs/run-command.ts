import { CHAT_COMMAND, RUN_COMMAND } from "./constants";

function commandPattern(command: string): RegExp {
  return new RegExp(`^${command}(?:\\s+([\\s\\S]*))?$`);
}

const RUN_COMMAND_PATTERN = commandPattern(RUN_COMMAND);
const CHAT_COMMAND_PATTERN = commandPattern(CHAT_COMMAND);

function parseCommand(draft: string, pattern: RegExp): string | null {
  const match = pattern.exec(draft.trim());
  if (!match) return null;
  return match[1]?.trim() ?? "";
}

export function parseRunCommand(draft: string): string | null {
  return parseCommand(draft, RUN_COMMAND_PATTERN);
}

export function parseChatCommand(draft: string): string | null {
  return parseCommand(draft, CHAT_COMMAND_PATTERN);
}

export function chatCommandFor(request: string): string {
  return `${CHAT_COMMAND} ${request}`;
}
