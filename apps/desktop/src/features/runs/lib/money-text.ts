const MICRO_PER_USD = 1_000_000;
const WHOLE_MICRO_USD = /^\d+$/;

export function usdFromMicro(microUsd: string): number | null {
  return WHOLE_MICRO_USD.test(microUsd) ? Number(BigInt(microUsd)) / MICRO_PER_USD : null;
}
