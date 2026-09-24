import { firstMatch } from "@weave/agent/browser";
import type { TaskContract } from "@weave/protocol";

const MAX_LISTED_VIOLATIONS = 10;

export function scopeViolations(
  files: readonly string[],
  scope: Pick<TaskContract, "allowedPaths" | "readOnlyPaths">,
): readonly string[] {
  return files.flatMap((file) => {
    const readOnly = scope.readOnlyPaths?.length ? firstMatch(scope.readOnlyPaths, file) : null;
    if (readOnly) return [`${file} is read-only (matches "${readOnly}")`];
    if (scope.allowedPaths?.length && !firstMatch(scope.allowedPaths, file)) {
      return [`${file} is outside allowedPaths`];
    }
    return [];
  });
}

export function describeViolations(violations: readonly string[]): string {
  const listed = violations.slice(0, MAX_LISTED_VIOLATIONS).join("; ");
  const more = violations.length > MAX_LISTED_VIOLATIONS ? ` (+${violations.length - MAX_LISTED_VIOLATIONS} more)` : "";
  return `wrote outside its scope: ${listed}${more}`;
}
