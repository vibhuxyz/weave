export function HistoryGapRow({ count }: { readonly count: number }) {
  return (
    <p role="note" className="mx-auto font-mono text-[12px] text-agent-text-faint">
      {count === 1 ? "1 earlier message wasn't kept" : `${count} earlier messages weren't kept`} · the archive has a size limit
    </p>
  );
}
