export function cleanOutput(raw: string): string {
  const withoutEnvelope = raw.replace(/^\s*```[\s\S]*?```/, "");
  return withoutEnvelope
    .split("\n")
    .filter((line) => !/^\s*(Task|Log):\s/.test(line))
    .join("\n")
    .trim();
}
