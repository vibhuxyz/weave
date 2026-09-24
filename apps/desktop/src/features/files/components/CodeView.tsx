export function CodeView({ content }: { readonly content: string }) {
  const lineCount = content.split("\n").length;
  const numbers = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
  return (
    <div className="flex min-w-0 font-mono text-xs leading-6">
      <pre aria-hidden className="shrink-0 select-none border-agent-border border-r px-3 text-right text-agent-text-faint">{numbers}</pre>
      <pre className="min-w-0 flex-1 overflow-x-auto px-3 text-agent-text">{content}</pre>
    </div>
  );
}
