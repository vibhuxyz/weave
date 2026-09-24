import { formatNumber } from "@/shared/i18n";
import { laneCostUsd, useRunStore } from "../store";

const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

export function LiveCost() {
  const totalUsd = useRunStore((state) =>
    Object.values(state.run?.lanes ?? {}).reduce((total, lane) => total + laneCostUsd(lane), 0),
  );
  return (
    <span className="font-mono text-agent-text-muted text-xs" aria-label="Run cost so far">
      {formatNumber(totalUsd, USD)}
    </span>
  );
}
