import { MAX_SIZE_UNITS, PROMPT_BYTES_PER_UNIT, UNKNOWN_KIND } from "./constants.ts";

interface FeatureTask {
  readonly prompt: string;
  readonly allowedPaths?: readonly string[];
  readonly component?: string;
}

export function sizeUnitsOf(prompt: string): number {
  const units = Math.ceil(Buffer.byteLength(prompt, "utf8") / PROMPT_BYTES_PER_UNIT);
  return Math.min(MAX_SIZE_UNITS, Math.max(1, units));
}

export function kindOfPaths(allowedPaths: readonly string[] | undefined): string {
  const first = allowedPaths?.[0]?.split("/").find((segment) => segment !== "" && segment !== ".");
  return first && !/[*?[\]{}!]/.test(first) ? first : UNKNOWN_KIND;
}

export function taskKindOf(task: FeatureTask): string {
  return task.component?.trim() || kindOfPaths(task.allowedPaths);
}

export function taskSizeUnits(task: FeatureTask): number {
  return sizeUnitsOf(task.prompt);
}
