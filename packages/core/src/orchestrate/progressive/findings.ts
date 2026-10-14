import { capBytes, escapeClosingTag } from "../../shared/index.ts";
import { FINDINGS_TAG, MAX_DISCOVERED_PATHS, MAX_FINDINGS_BYTES } from "./constants.ts";
import type { WorkArea } from "./types.ts";

export function renderFindings(areas: readonly WorkArea[], paths: readonly string[]): string {
  const lines = [
    ...areas.map((area) => `${area.role} ${area.dir}`),
    ...[...paths].sort().slice(0, MAX_DISCOVERED_PATHS).map((path) => `touched ${path}`),
  ].sort();
  if (lines.length === 0) return "";
  const body = escapeClosingTag(lines.join("\n"), FINDINGS_TAG);
  return capBytes(`<${FINDINGS_TAG} source="running worker and repository snapshot">\n${body}\n</${FINDINGS_TAG}>`, MAX_FINDINGS_BYTES);
}
