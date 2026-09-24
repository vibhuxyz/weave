const TRUNCATION_MARK = "\n(truncated)";
const OMITTED_TRAILER_BYTES = 16;

export function capBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const markBytes = Buffer.byteLength(TRUNCATION_MARK, "utf8");
  const kept = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - markBytes));
  return `${kept.toString("utf8").replace(/�+$/, "")}${TRUNCATION_MARK}`;
}

export function capLines(lines: readonly string[], maxBytes: number): string {
  if (Buffer.byteLength(lines.join("\n"), "utf8") <= maxBytes) return lines.join("\n");

  const kept: string[] = [];
  let usedBytes = 0;
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, "utf8") + 1;
    if (usedBytes + lineBytes > maxBytes - OMITTED_TRAILER_BYTES) break;
    kept.push(line);
    usedBytes += lineBytes;
  }
  return [...kept, `(+${lines.length - kept.length} more)`].join("\n");
}

export function escapeClosingTag(text: string, tag: string): string {
  return text.replaceAll(`</${tag}>`, `<\\/${tag}>`);
}

export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
