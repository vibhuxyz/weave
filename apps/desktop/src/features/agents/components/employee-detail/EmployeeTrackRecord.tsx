import type { EmployeeDetailState, EmployeeEntry } from "@/features/employees";
import { formatDate, formatNumber } from "@/shared/i18n";
import { DATE_TIME, MAX_MEMORY_TEXT_SHOWN, MS_PER_SECOND, SECONDS } from "./constants";
import { DetailSection, FactRow } from "./DetailSection";

function whenOf(isoTimestamp: string): string {
  return Number.isNaN(Date.parse(isoTimestamp)) ? isoTimestamp : formatDate(isoTimestamp, DATE_TIME);
}

function Performance({ performance }: { readonly performance: EmployeeEntry["performance"] }) {
  if (!performance) return <p className="text-muted-foreground">No runs yet. Assigned tasks from parallel runs show up here.</p>;
  return (
    <dl>
      <FactRow label="Tasks">{performance.tasks}</FactRow>
      <FactRow label="Succeeded">{performance.ok}</FactRow>
      <FactRow label="Median time">{performance.medianWallMs === null ? "Unknown" : formatNumber(performance.medianWallMs / MS_PER_SECOND, SECONDS)}</FactRow>
    </dl>
  );
}

function Memory({ detail }: { readonly detail: Extract<EmployeeDetailState, { status: "ready" }>["detail"] }) {
  if (detail.memory.length === 0) return <p className="text-muted-foreground">Nothing remembered yet.</p>;
  const hidden = detail.memoryTotal - detail.memory.length;
  return (
    <ul className="space-y-2">
      {detail.memory.map((entry) => (
        <li key={`${entry.at}:${entry.runId}:${entry.taskId}:${entry.kind}`} className="rounded-lg bg-accent/50 px-3 py-2">
          <p className="text-muted-foreground text-xs">{entry.kind} · {whenOf(entry.at)} · task {entry.taskId}</p>
          <p className="mt-1 break-words">{entry.text.slice(0, MAX_MEMORY_TEXT_SHOWN)}</p>
        </li>
      ))}
      {hidden > 0 && <li className="text-muted-foreground text-xs">(+{hidden} older)</li>}
    </ul>
  );
}

export function EmployeeTrackRecord({ entry, detail }: { readonly entry: EmployeeEntry; readonly detail: EmployeeDetailState | undefined }) {
  return (
    <div className="space-y-6">
      <DetailSection title="Track record">
        <Performance performance={entry.performance} />
      </DetailSection>
      {detail?.status === "error" && <p role="alert" className="text-destructive text-sm">{detail.message}</p>}
      {(!detail || detail.status === "loading") && <p role="status" className="text-muted-foreground text-sm">Loading memory and brief…</p>}
      {detail?.status === "ready" && (
        <>
          <DetailSection title="Recent memory">
            {detail.detail.memoryIssue && <p className="mb-2 text-muted-foreground text-xs">{detail.detail.memoryIssue}</p>}
            <Memory detail={detail.detail} />
          </DetailSection>
          <DetailSection title="Brief sent to the engine">
            <p className="mb-2 text-muted-foreground text-xs">Recalled memories for the task are added after it.</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-card/60 p-4 font-mono text-xs">{detail.detail.brief}</pre>
          </DetailSection>
        </>
      )}
    </div>
  );
}
