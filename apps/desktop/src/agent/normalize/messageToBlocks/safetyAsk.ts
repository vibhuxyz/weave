import type { ToolEntry } from "@/features/chat/hooks";
import { emptySource, type SafetyAskBlock } from "../types";

const SAFETY_TRIGGER =
  /before i go further|need the intent|what'?s (?:the|your) (?:context|intent|use case|goal)|stopping to ask|help me understand (?:the|your)/i;

export function safetyAskFromText(
  text: string,
  _tools: ToolEntry[],
): SafetyAskBlock | null {
  if (!SAFETY_TRIGGER.test(text)) return null;

  const lines = text.split("\n").map((l) => l.trim());
  const first = lines.find(Boolean);

  let actuallyIs: string | undefined;
  const aiIdx = lines.findIndex((l) => /what it actually is/i.test(l));
  if (aiIdx !== -1) actuallyIs = lines.slice(aiIdx + 1).find(Boolean);

  const subtitleMatch = text.match(
    /I'?m not assuming the worst[^.\n]*\.[^\n]*/i,
  );

  return {
    id: "safety-ask",
    schemaVersion: 1,
    source: emptySource(),
    type: "safety-ask",
    title: "Stopping to ask",
    body: first ?? text.trim(),
    actuallyIs,
    actionSubtitle: subtitleMatch ? subtitleMatch[0].trim() : undefined,
    concerns: extractConcernLines(text),
    choices: extractChoices(text),
  };
}

function extractChoices(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];

  // 1. bullet list under a "which of these / options" heading
  const startIdx = lines.findIndex((l) =>
    /which (?:of these|one)|pick the|choose the|options?:|is this (?:a|an|for)/i.test(l),
  );
  if (startIdx !== -1) {
    for (const l of lines.slice(startIdx + 1)) {
      const b = /^[-*]\s+(?:\*\*(.+?)\*\*|(.+?))(?:\s+[—-]\s.*)?$/.exec(l.trim());
      if (b) out.push((b[1] ?? b[2] ?? "").trim());
      else if (out.length && l.trim() === "") break;
      else if (out.length) break;
    }
  }

  // 2. "- **Label** — description" anywhere
  if (out.length === 0) {
    for (const l of lines) {
      const b = /^[-*]\s+\*\*(.+?)\*\*\s+[—-]\s/.exec(l.trim());
      if (b) out.push((b[1] ?? "").trim());
    }
  }

  // 3. inline "A) … B) …"
  if (out.length === 0) {
    const inline = text.match(/\b[A-D]\)\s*([^\n)]+?)(?=\s+[A-D]\)|\s*$|\n)/g);
    if (inline) for (const m of inline) out.push(m.replace(/^[A-D]\)\s*/, "").trim());
  }

  return out
    .filter((c) => c && c.length <= 80)
    .slice(0, 6);
}

function extractConcernLines(text: string) {
  const lines = text.split("\n");
  const concernHeadingIdx = lines.findIndex((l) =>
    /what concerns me|concerns?:|risks?:|why i'?m asking/i.test(l.trim()),
  );
  const choiceHeadingIdx = lines.findIndex((l) =>
    /which (?:of these|one)|pick the|options?:/i.test(l.trim()),
  );

  const region =
    concernHeadingIdx !== -1
      ? lines.slice(
          concernHeadingIdx + 1,
          choiceHeadingIdx !== -1 ? choiceHeadingIdx : undefined,
        )
      : lines.slice(0, choiceHeadingIdx !== -1 ? choiceHeadingIdx : undefined);

  const out: Array<{ title: string; tag: string; evidence?: string }> = [];
  region.forEach((raw, i) => {
    const l = raw.trim();
    const b = /^(?:\d+[.)]\s+|[-*]\s+)(.+)$/.exec(l);
    if (!b) return;
    const title = (b[1] ?? "").replace(/\*\*/g, "").trim();
    if (title.length < 6) return;
    const inlineCode = /`([^`]+)`/.exec(title);
    const nextLine = region[i + 1];
    const nextIndented =
      nextLine && /^\s{2,}\S/.test(nextLine) ? nextLine.trim() : undefined;
    out.push({
      title: title.slice(0, 160),
      tag: inferConcernTag(title),
      evidence: inlineCode?.[1] ?? nextIndented,
    });
  });
  return out.slice(0, 6);
}

function inferConcernTag(line: string): string {
  if (/password|credential|secret|api[_ ]?key|token/i.test(line)) return "credentials";
  if (/auth|bypass|unauthenticated|no session|permission/i.test(line)) return "auth";
  if (/swift|wise|brand|impersonat|logo/i.test(line)) return "impersonation";
  if (/fabricat|fake|invented|forged|public link/i.test(line)) return "fabricated data";
  if (/inject|xss|csrf|rce|traversal/i.test(line)) return "injection";
  if (/scrap|scale|mass|bulk/i.test(line)) return "scale";
  return "concern";
}
