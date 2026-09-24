export function DiffStat({ additions, deletions }: { readonly additions: number; readonly deletions: number }) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <span className="ml-1.5 tabular-nums">
      <span className="text-agent-success">+{additions}</span>
      <span className="text-agent-critical">-{deletions}</span>
    </span>
  );
}
