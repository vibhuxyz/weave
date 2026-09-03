import { blockBase, type SourceEventRef } from "./eventToBlock";
import type { FindingBlock } from "./types";

const SEVERITY_PATTERN = /\b(CRITICAL|HIGH|MEDIUM|LOW)\b[:\s-]+([^\n]+)/gi;

export function findingsFromKnownText(
  text: string,
  source?: SourceEventRef,
): FindingBlock[] {
  const findings: FindingBlock[] = [];
  let match = SEVERITY_PATTERN.exec(text);

  while (match !== null) {
    const severity = match[1].toLowerCase() as FindingBlock["severity"];
    const title = match[2].trim().replace(/^[-:]\s*/, "");
    const start = match.index + match[0].length;
    const next = SEVERITY_PATTERN.exec(text);
    if (next) SEVERITY_PATTERN.lastIndex = next.index;
    const end = next?.index ?? text.length;
    const body = text.slice(start, end).trim().split("\n\n")[0]?.trim() ?? "";

    findings.push({
      ...blockBase(`finding-${findings.length + 1}`, source),
      type: "finding",
      severity,
      title,
      body,
      verified: /\bverified\b/i.test(body),
      evidence: extractEvidence(body),
      actions: ["Open file", "View evidence", "Re-run"],
    });

    match = next ?? SEVERITY_PATTERN.exec(text);
  }

  return findings;
}

function extractEvidence(text: string): FindingBlock["evidence"] {
  const rows: FindingBlock["evidence"] = [];
  for (const line of text.split("\n")) {
    const statusMatch = /\b(GET|POST|PATCH|DELETE|PUT)\s+(\S+).*?(?:→|->)\s*(\d{3})/i.exec(
      line,
    );
    if (!statusMatch) continue;
    const code = Number(statusMatch[3]);
    rows.push({
      label: `${statusMatch[1].toUpperCase()} ${statusMatch[2]}`,
      value: String(code),
      status: code >= 400 ? "failed" : "ok",
    });
  }
  return rows;
}
