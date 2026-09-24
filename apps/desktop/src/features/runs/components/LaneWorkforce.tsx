import { useEmployeeListing } from "@/features/employees";
import { cn } from "@/shared/lib";
import type { Lane, LaneEmployee } from "../types";

const WORKING: ReadonlySet<Lane["status"]> = new Set(["waiting", "running"]);

function EmployeeLine({ employee }: { readonly employee: LaneEmployee }) {
  const listing = useEmployeeListing();
  const reasons = employee.reasons.join("; ");
  if (employee.employeeId === null) return <span className="text-[11px] text-agent-text-faint" title={reasons}>No employee fits: {reasons || "no match"}</span>;
  const id = employee.employeeId;
  const name = listing.status === "ready" ? listing.entries.find((entry) => entry.employee.id === id)?.employee.name : undefined;
  return <span className="text-[11px] text-agent-text-muted" title={reasons}>by {name ?? id}</span>;
}

export function LaneWorkforce({ lane }: { readonly lane: Lane }) {
  const { employee, verification, blockedReason, claims, notes } = lane;
  return (
    <>
      {employee && <EmployeeLine employee={employee} />}
      {blockedReason && WORKING.has(lane.status) && <span className="text-[11px] text-agent-warn">Blocked: {blockedReason}</span>}
      {claims.length > 0 && <span className="truncate font-mono text-[11px] text-agent-text-faint" title={claims.join(", ")}>owns {claims.join(", ")}</span>}
      {verification && (
        <span className={cn("text-[11px]", verification.ok ? "text-agent-success" : "text-agent-critical-fg")} title={verification.detail}>
          checks {verification.ok ? "passed" : "failed"}: {verification.rungs.map((rung) => `${rung.rung} ${rung.ok ? "ok" : "failed"}`).join(", ") || "none"}
        </span>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px]">
          {notes.map((note) => (
            <li key={note.id} className={cn("truncate", note.tone === "warning" ? "text-agent-warn" : "text-agent-text-muted")} title={note.text}>{note.text}</li>
          ))}
        </ul>
      )}
    </>
  );
}
