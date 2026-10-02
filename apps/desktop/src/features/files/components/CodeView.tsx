export function CodeView({ content, filename }: { readonly content: string; readonly filename?: string }) {
  const lines = content.split("\n");
  return (
    <div className="min-w-0 font-mono text-[11px] leading-[1.6]">
      <table className="w-full border-collapse border-spacing-0">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="hover:bg-agent-surface-hover/30 group">
              <td className="w-12 shrink-0 select-none border-agent-border/50 border-r bg-agent-surface-raised px-3 text-right text-agent-text-faint align-top sticky left-0 z-10">
                {i + 1}
              </td>
              <td className="whitespace-pre-wrap px-4 py-0 text-agent-text align-top break-all">
                {line || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
