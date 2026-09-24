const MICRO_PER_UNIT = 1_000_000;
const MICRO_DIGITS = 6;
const USD_AMOUNT = /^(\d{1,9})(?:\.(\d{1,6}))?$/;

export function usdToMicro(usd: number): bigint {
  return Number.isFinite(usd) && usd > 0 ? BigInt(Math.round(usd * MICRO_PER_UNIT)) : 0n;
}

export function parseUsd(text: string): bigint | null {
  const match = USD_AMOUNT.exec(text.trim());
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(MICRO_DIGITS, "0"));
  return whole * BigInt(MICRO_PER_UNIT) + fraction;
}

export function formatMicroUsd(micro: bigint): string {
  const unit = BigInt(MICRO_PER_UNIT);
  const fraction = (micro % unit).toString().padStart(MICRO_DIGITS, "0");
  return `$${(micro / unit).toString()}.${fraction}`;
}
