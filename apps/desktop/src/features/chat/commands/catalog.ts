export interface SlashCommand {
  readonly id: string;
  readonly trigger: string;
  readonly title: string;
  readonly hint: string;
  readonly takesPrompt: boolean;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "img",
    trigger: "/img",
    title: "Attach an image",
    hint: "Picks an image you used earlier in this session",
    takesPrompt: false,
  },
];

const COMMAND_QUERY = /^\/([a-z-]*)$/;

export function commandQueryOf(head: string): string | null {
  const match = COMMAND_QUERY.exec(head);
  return match ? (match[1] ?? "") : null;
}

export function matchCommands(query: string | null): readonly SlashCommand[] {
  if (query === null) return [];
  const wanted = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.id.startsWith(wanted));
}
