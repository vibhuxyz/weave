import { cn } from "@/shared/lib";
import { tokenizeCommand, type CommandTokenKind } from "./command-tokens";

const MAX_COMMAND_CHARS = 4_000;

const TOKEN_CLASS = {
  command: "text-agent-info-fg",
  flag: "text-agent-warn",
  string: "text-agent-success",
  operator: "text-agent-text-faint",
  space: "",
  word: "text-agent-text",
} as const satisfies Record<CommandTokenKind, string>;

export function CommandLine({ command, className }: { readonly command: string; readonly className?: string }) {
  return (
    <pre className={cn("overflow-auto whitespace-pre-wrap break-all rounded-lg bg-agent-code-bg px-3 py-2 font-mono text-xs", className)}>
      <span className="text-agent-text-faint">$ </span>
      {tokenizeCommand(command.slice(0, MAX_COMMAND_CHARS)).map((token, index) => (
        <span key={`${index}:${token.text}`} className={TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
      {command.length > MAX_COMMAND_CHARS && <span className="text-agent-text-faint"> …</span>}
    </pre>
  );
}
