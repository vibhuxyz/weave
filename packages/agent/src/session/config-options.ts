import type { SessionConfigOption } from "@weave/protocol";

export interface ApplyConfigResult {
  applied: Record<string, string>;
  refused: Record<string, string>;
}

export async function applyConfigOptions(
  set: (configId: string, value: string) => Promise<void>,
  wanted: Record<string, string>,
): Promise<ApplyConfigResult> {
  const applied: Record<string, string> = {};
  const refused: Record<string, string> = {};

  for (const [configId, value] of Object.entries(wanted)) {
    try {
      await set(configId, value);
      applied[configId] = value;
    } catch (error) {
      refused[configId] =
        error instanceof Error ? error.message : String(error);
    }
  }

  return { applied, refused };
}

export function readSelectValues(
  options: SessionConfigOption[],
): Record<string, string> {
  return Object.fromEntries(
    options.flatMap((option) =>
      option.type === "select" ? [[option.id, option.currentValue]] : [],
    ),
  );
}
