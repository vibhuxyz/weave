import { cn } from "@/shared/lib";
import { tokenizeCommand, type CommandTokenKind } from "./command-tokens";
import { CODE_BLOCK_CLASS } from "./constants";
import { CopyCodeButton } from "./CopyCodeButton";

const MAX_COMMAND_CHARS = 4_000;

const TOKEN_CLASS = {
  command: "text-agent-low-fg",
  flag: "text-agent-high-fg",
  string: "text-agent-success",
  operator: "text-agent-text-muted",
  space: "",
  word: "text-agent-medium-fg/80",
} as const satisfies Record<CommandTokenKind, string>;

export function CommandLine({ command, className }: { readonly command: string; readonly className?: string }) {
  return (
    <div className="relative">
      <pre className={cn(CODE_BLOCK_CLASS, className)}>
        <span className="text-agent-text-muted">$ </span>
        {tokenizeCommand(command.slice(0, MAX_COMMAND_CHARS)).map((token, index) => (
          <span key={`${index}:${token.text}`} className={TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
        {command.length > MAX_COMMAND_CHARS && <span className="text-agent-text-faint"> …</span>}
      </pre>
      <CopyCodeButton text={command} label="Copy command" />
    </div>
  );
}
