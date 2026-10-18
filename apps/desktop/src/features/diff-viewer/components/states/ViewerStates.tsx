import { MAX_VISIBLE_SKIPPED } from "../../constants";
import type { SkippedFile } from "../../types";

export function DiffLoading() {
  return <div className="m-4 h-40 animate-pulse rounded-lg bg-agent-surface-hover motion-reduce:animate-none" />;
}

export function DiffEmpty({ message }: { readonly message: string }) {
  return <p className="px-4 py-3 text-agent-text-faint text-xs">{message}</p>;
}

export function DiffError({ message }: { readonly message: string }) {
  return <p className="px-4 py-3 text-agent-critical-fg text-sm">{message}</p>;
}

export function CollapsedBanner() {
  return (
    <p className="rounded-lg bg-diff-banner-bg px-3 py-2 text-[13px] text-agent-text-muted">
      Files are collapsed for large diffs. Select a file to expand it.
    </p>
  );
}

export function SkippedNotice({ skipped }: { readonly skipped: readonly SkippedFile[] }) {
  if (skipped.length === 0) return null;
  const shown = skipped.slice(0, MAX_VISIBLE_SKIPPED);
  const rest = skipped.length - shown.length;
  return (
    <details className="rounded-lg bg-diff-banner-bg px-3 py-2 text-[12px] text-agent-text-faint">
      <summary className="cursor-pointer">
        {skipped.length} file{skipped.length === 1 ? "" : "s"} not shown
      </summary>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
        {shown.map((file) => (
          <li key={`${file.path}:${file.reason}`}>
            {file.path || "diff"} &mdash; {file.reason}
          </li>
        ))}
        {rest > 0 && <li>(+{rest} more)</li>}
      </ul>
    </details>
  );
}
