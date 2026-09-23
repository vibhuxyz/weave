import { useState } from "react";
import { Slider } from "@/shared/ui";
import {
  MAX_AUTO_COMPACT_THRESHOLD_PERCENT,
  MIN_AUTO_COMPACT_THRESHOLD_PERCENT,
  clampThresholdPercent,
  isAutoCompactOff,
  percentToThreshold,
  thresholdToPercent,
} from "../lib";
import { useAutoCompactThreshold, writeAutoCompactThreshold } from "../preferences";

const LABEL = "Auto-compact context";

function valueLabel(percent: number): string {
  return isAutoCompactOff(percent) ? "Off" : `${percent}%`;
}

export function AutoCompactSetting() {
  const savedPercent = thresholdToPercent(useAutoCompactThreshold());
  const [draftPercent, setDraftPercent] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const shownPercent = draftPercent ?? savedPercent;

  const handleChange = (values: number[]) => {
    setSaveError(null);
    setDraftPercent(clampThresholdPercent(values[0] ?? savedPercent));
  };

  const handleCommit = (values: number[]) => {
    const result = writeAutoCompactThreshold(percentToThreshold(values[0] ?? savedPercent));
    setDraftPercent(null);
    if (!result.ok) setSaveError(result.message);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-foreground">{LABEL}</p>
        <span className="shrink-0 text-xs tabular-nums text-foreground">{valueLabel(shownPercent)}</span>
      </div>
      <Slider
        value={[shownPercent]}
        min={MIN_AUTO_COMPACT_THRESHOLD_PERCENT}
        max={MAX_AUTO_COMPACT_THRESHOLD_PERCENT}
        step={1}
        onValueChange={handleChange}
        onValueCommit={handleCommit}
        aria-label={LABEL}
      />
      <p className="text-[11px] text-muted-foreground">
        Before sending a message, Weave asks the engine to summarize older turns once context use passes this
        level. Set 100% to turn it off. Lower values keep more headroom; higher values keep more exact detail.
      </p>
      {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}
    </div>
  );
}
