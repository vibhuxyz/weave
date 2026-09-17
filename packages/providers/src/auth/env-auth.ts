import type { EnvironmentAuthMethod } from "./types.ts";

export interface EnvValidationResult {
  readonly valid: boolean;
  readonly missingKeys: readonly string[];
}

export function verifyEnvAuth(
  method: EnvironmentAuthMethod,
  env: Record<string, string | undefined>,
): EnvValidationResult {
  const missingKeys = method.requiredKeys.filter((k) => !env[k]);
  return {
    valid: missingKeys.length === 0,
    missingKeys,
  };
}
