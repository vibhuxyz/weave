/** `717` / `1.2k` — a compact token count, matching the AgentHeader convention. */
export function formatTokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}
