import { useRunStore } from "../store";

export function PlanRejection() {
  const rejections = useRunStore((state) => state.run?.rejections ?? []);
  if (rejections.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-[11px] text-agent-text-muted" aria-label="Dropped plans">
      {rejections.map((rejection, index) => (
        <div key={`${index}:${rejection.reasons[0] ?? "plan"}`} className="flex flex-col gap-1">
          <span className="font-medium text-agent-warn">
            {rejection.willRepair ? "This plan was rejected. Weave is asking for a fixed plan." : "This plan was dropped. One worker continues."}
          </span>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {rejection.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {rejection.hiddenReasonCount > 0 && <span className="text-agent-text-faint">(+{rejection.hiddenReasonCount} more)</span>}
        </div>
      ))}
    </div>
  );
}
