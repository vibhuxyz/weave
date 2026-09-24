import { RUN_COMMAND } from "./constants";

const RUN_COMMAND_PATTERN = new RegExp(`^${RUN_COMMAND}(?:\\s+([\\s\\S]*))?$`);

export function parseRunCommand(draft: string): string | null {
  const match = RUN_COMMAND_PATTERN.exec(draft.trim());
  if (!match) return null;
  return match[1]?.trim() ?? "";
}
