import type { EngineHandoffNotice } from "@/features/chat/hooks";
import { formatNumber } from "@/shared/i18n";

const BYTES_PER_KILOBYTE = 1024;
const KILOBYTE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

function turnsLabel(count: number): string {
  return count === 1 ? "1 turn" : `${formatNumber(count)} turns`;
}

function handoffSummary(notice: EngineHandoffNotice): string {
  const size = `${formatNumber(notice.bytes / BYTES_PER_KILOBYTE, KILOBYTE_FORMAT)} KB`;
  if (notice.isResumed) {
    return notice.turnsHandedOff === 0
      ? "resumed its earlier session · nothing new to catch up on"
      : `resumed its earlier session · caught up on ${turnsLabel(notice.turnsHandedOff)} (${size})`;
  }
  return notice.turnsHandedOff === 0
    ? "new session · no earlier turns to hand over"
    : `new session · handed over ${turnsLabel(notice.turnsHandedOff)} (${size})`;
}

export function EngineHandoffRow({ notice }: { readonly notice: EngineHandoffNotice }) {
  return (
    <p role="note" className="mx-auto font-mono text-[12px] text-agent-text-faint">
      Switched to {notice.toEngineLabel} · {handoffSummary(notice)}
    </p>
  );
}
