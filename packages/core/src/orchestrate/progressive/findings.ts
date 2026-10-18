import { capBytes, escapeClosingTag, flatten } from "../../shared/index.ts";
import { FINDINGS_TAG, MAX_DISCOVERED_PATHS, MAX_FINDINGS_BYTES, MAX_SPLIT_REASON_BYTES, SPLIT_PLAN_NOTE } from "./constants.ts";
import type { WorkArea } from "./types.ts";

export function renderFindings(areas: readonly WorkArea[], paths: readonly string[], splitReason: string | null): string {
  const lines = [
    ...areas.map((area) => `${area.role} ${area.dir}`),
    ...[...paths].sort().slice(0, MAX_DISCOVERED_PATHS).map((path) => `touched ${path}`),
  ].sort();
  const reason = splitReason ? [`split-reason ${capBytes(flatten(splitReason), MAX_SPLIT_REASON_BYTES)}`] : [];
  if (lines.length === 0 && reason.length === 0) return "";
  const body = capBytes(escapeClosingTag([...reason, ...lines].join("\n"), FINDINGS_TAG), MAX_FINDINGS_BYTES);
  const block = `<${FINDINGS_TAG} source="running worker and repository snapshot">\n${body}\n</${FINDINGS_TAG}>`;
  return splitReason ? `${block}\n${SPLIT_PLAN_NOTE}` : block;
}
