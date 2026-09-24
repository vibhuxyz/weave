import type { ResolvedSkill } from "./types.ts";

const MAX_SKILLS_BYTES = 6_000;
const CLOSING_TAG = "</skills>";

function entryOf(resolved: ResolvedSkill): string {
  const { skill, reasons } = resolved;
  const why = `(chosen for: ${reasons.join("; ")})`;
  if (skill.body !== null) return `## ${skill.name} ${why}\n${skill.body}`;
  return `## ${skill.name} — project skill ${why}\n${skill.description}\nRead the full skill at ${skill.sourcePath ?? "its SKILL.md"} before starting.`;
}

export function renderSkills(resolved: readonly ResolvedSkill[], maxBytes = MAX_SKILLS_BYTES): string {
  if (resolved.length === 0) return "";
  const kept: string[] = [];
  let bytes = 0;
  for (const entry of resolved.map(entryOf)) {
    const safe = entry.replaceAll(CLOSING_TAG, "<\\/skills>");
    const size = Buffer.byteLength(`${safe}\n\n`, "utf8");
    if (bytes + size > maxBytes) break;
    kept.push(safe);
    bytes += size;
  }
  const cut = resolved.length - kept.length;
  return ["<skills>", ...kept, ...(cut > 0 ? [`(${cut} more skills left out to stay under ${maxBytes} bytes)`] : []), CLOSING_TAG].join("\n\n");
}
