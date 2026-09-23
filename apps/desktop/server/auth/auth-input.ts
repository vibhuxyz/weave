const MAX_AUTH_INPUT_CHARS = 4096;
const LINE_BREAKS = /[\r\n]+/g;

export function toAuthInputLine(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const line = text.replace(LINE_BREAKS, "").trim();
  if (line.length === 0 || line.length > MAX_AUTH_INPUT_CHARS) return null;
  return line;
}
