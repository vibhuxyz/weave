import type { SessionConfigOption } from "@berd/protocol";

/**
 * Apply agent settings (`model`, `mode`, `effort`, `fast`) and report which
 * ones were refused.
 *
 * Refusals are normal, not exceptional: `effort` and `fast` exist on Opus and
 * are rejected on Haiku, reported as a bare "Internal error". Callers need the
 * per-key outcome so an optimistic UI can roll back rather than display a
 * value the agent never accepted.
 */
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

/** Current values of every select-type option, keyed by id. */
export function readSelectValues(
  options: SessionConfigOption[],
): Record<string, string> {
  return Object.fromEntries(
    options.flatMap((option) =>
      option.type === "select" ? [[option.id, option.currentValue]] : [],
    ),
  );
}
