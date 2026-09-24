export function DiffStat({ additions, deletions }: { readonly additions: number; readonly deletions: number }) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <span className="ml-1.5 font-mono text-xs">
      <span className="text-agent-success">+{additions}</span>
      <span className="ml-0.5 text-agent-critical-fg">-{deletions}</span>
    </span>
  );
}
