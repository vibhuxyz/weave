import { blockBase, type SourceEventRef } from "./eventToBlock";
import type { FindingBlock, FindingSeverity } from "./types";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
const SEV_WORD = "(critical|high|medium|low|info)";

// Order matters — most specific first. Each returns [full, severity, title?].
const SEVERITY_PATTERNS: RegExp[] = [
  // "CRITICAL: title" / "High - title" at line start
  new RegExp(`^\\s*(?:\\d+\\.\\s*)?${SEV_WORD}\\b[:.\\s-]+(.+)$`, "i"),
  // "**High**: title" / "__Critical__ title"
  new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*|__)${SEV_WORD}(?:\\*\\*|__)[:.\\s-]*(.*)$`, "i"),
  // "Severity: High — title"
  new RegExp(`^\\s*severity[:\\s-]+${SEV_WORD}\\b[\\s—-]*(.*)$`, "i"),
  // "[High] title" / "(high) title"
  new RegExp(`^\\s*(?:[-*]\\s*)?[\\[(]${SEV_WORD}[\\])][:.\\s-]*(.*)$`, "i"),
  // bullet issue: "- **title** …" with an issue verb (severity inferred later)
];

const ISSUE_HINT =
  /\b(should|must|missing|no\s|lacks?|unsafe|leak|inject|bypass|hardcod|exposed?|vulnerab|unauth|plaintext|race condition|not (?:checked|validated|sanitiz))/i;
const FILE_REF = /\b([\w.\-/]+\.[a-z]{1,5})(?::(\d+))?\b/i;

/**
 * Extract findings from one text section. Additive — the caller runs this per
 * section, so a false negative just means the section renders as prose.
 */
export function findingsFromKnownText(
  text: string,
  source?: SourceEventRef,
  opts: { hasCommands?: boolean } = {},
): FindingBlock[] {
  const lines = text.split("\n");
  const hits: Array<{ line: number; severity: FindingSeverity; title: string }> = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    for (const re of SEVERITY_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        hits.push({
          line: i,
          severity: m[1].toLowerCase() as FindingSeverity,
          title: cleanTitle(m[2] ?? ""),
        });
        return;
      }
    }
    // Bullet issue without an explicit severity word.
    const bullet = /^[-*]\s+(?:\*\*)?(.+?)(?:\*\*)?$/.exec(line);
    if (bullet && ISSUE_HINT.test(line) && (FILE_REF.test(line) || /`[^`]+`/.test(line))) {
      hits.push({ line: i, severity: "medium", title: cleanTitle(bullet[1]) });
    }
  });

  return hits.map((hit, idx) => {
    const bodyStart = hit.line + 1;
    const bodyEnd = idx + 1 < hits.length ? hits[idx + 1].line : lines.length;
    const body = lines.slice(bodyStart, bodyEnd).join("\n").trim();
    return makeFinding({
      id: `finding-${idx + 1}`,
      severity: hit.severity,
      title: hit.title,
      body,
      source,
      hasCommands: opts.hasCommands,
    });
  });
}

/** Build one finding from a known title + body. Shared by the text scanner and
 *  the "Bug #N:" heading path in messageToBlocks. */
export function makeFinding(input: {
  id: string;
  title: string;
  body: string;
  severity?: FindingSeverity;
  source?: SourceEventRef;
  hasCommands?: boolean;
}): FindingBlock {
  const { id, body, source } = input;
  const title = input.title.trim();
  const titleAndBody = `${title}\n${body}`;

  const loc = locate(titleAndBody);
  const evidenceCode = firstFence(body);
  const verified = /\b(verified|confirmed|reproduced)\b/i.test(titleAndBody);
  const evidence = extractEvidence(titleAndBody);

  let severity = input.severity ?? "medium";
  if (!input.severity) {
    if (/\b(rce|auth bypass|sql inject|negative (?:margin|balance)|lose funds|data loss|drain)\b/i.test(titleAndBody))
      severity = "high";
    else if (/\b(crash|500|throws?|uncaught|impossible|breaks?|corrupt)\b/i.test(titleAndBody))
      severity = "high";
  }

  const actions: string[] = ["Explain"];
  if (loc) actions.unshift("Open file");
  if (evidence.length || evidenceCode) actions.push("View evidence");
  if (input.hasCommands) actions.push("Re-run");

  return {
    ...blockBase(id, source),
    type: "finding",
    severity: SEVERITIES.includes(severity) ? severity : "medium",
    findingStatus: verified ? "verified" : "discovered",
    title: title || firstSentence(body) || "Finding",
    body: title ? body : dropFirstSentence(body),
    location: loc,
    verified,
    evidence,
    evidenceCode,
    actions,
  };
}

function cleanTitle(s: string): string {
  return s
    .trim()
    .replace(/^[-:—\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .slice(0, 160)
    .trim();
}

function firstSentence(s: string): string {
  return (s.split(/(?<=[.!?])\s/)[0] ?? "").trim().slice(0, 160);
}

function dropFirstSentence(s: string): string {
  const parts = s.split(/(?<=[.!?])\s/);
  return parts.slice(1).join(" ").trim();
}

function locate(text: string): FindingBlock["location"] | undefined {
  const m =
    /(?:in|at)\s+([\w.\-/]+\.[a-z]{1,5})(?:[:\s]+(?:line\s+)?(\d+))?/i.exec(text) ??
    FILE_REF.exec(text);
  if (!m) return undefined;
  return { file: m[1], line: m[2] ? Number(m[2]) : undefined };
}

function firstFence(text: string): FindingBlock["evidenceCode"] {
  const m = /```(\w+)?\n([\s\S]*?)```/.exec(text);
  if (!m) return undefined;
  return { language: m[1], code: m[2].replace(/\s+$/, "") };
}

function extractEvidence(text: string): FindingBlock["evidence"] {
  const rows: FindingBlock["evidence"] = [];
  for (const line of text.split("\n")) {
    const http = /\b(GET|POST|PATCH|DELETE|PUT)\s+(\S+).*?(?:→|->|-)\s*(\d{3})/i.exec(line);
    if (http) {
      const code = Number(http[3]);
      rows.push({
        label: `${http[1].toUpperCase()} ${http[2]}`,
        value: String(code),
        status: code >= 500 ? "failed" : code >= 400 ? "warning" : "ok",
      });
      continue;
    }
    const exit = /\bexit(?:\s+code)?\s+(\d+)/i.exec(line);
    if (exit) {
      rows.push({
        label: "exit code",
        value: exit[1],
        status: exit[1] === "0" ? "ok" : "failed",
      });
      continue;
    }
    const status = /\bHTTP\s+(\d{3})\b/i.exec(line) ?? /\bstatus[=:\s]+(\d{3})\b/i.exec(line);
    if (status) {
      const code = Number(status[1]);
      rows.push({
        label: "status",
        value: status[1],
        status: code >= 400 ? "failed" : "ok",
      });
    }
  }
  return rows;
}
