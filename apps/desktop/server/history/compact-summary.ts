import { COMPACT_SUMMARY_PREFIX, MAX_SUMMARY_CHARS } from "./constants.ts";

function bounded(text: string): string {
  return text.length <= MAX_SUMMARY_CHARS ? text : `${text.slice(0, MAX_SUMMARY_CHARS)}\n\n[summary truncated]`;
}

export function summaryFromReplayText(text: string): string | null {
  return COMPACT_SUMMARY_PREFIX.test(text) ? bounded(text) : null;
}

function messageText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((block: unknown) =>
    typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ? [block.text] : [],
  );
  return parts.length > 0 ? parts.join("\n") : null;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function summaryFromClaudeRecord(line: string): string | null {
  if (!line.includes('"isCompactSummary":true')) return null;
  const record = parseJsonLine(line);
  if (typeof record !== "object" || record === null || !("message" in record)) return null;
  const message = record.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;
  const text = messageText(message.content);
  return text ? bounded(text) : null;
}
