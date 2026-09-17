import type { CliAuthMethod } from "./types.ts";

export interface CliExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
}

export async function executeCliAuth(
  method: CliAuthMethod,
  runner: (cmd: string, args: readonly string[]) => Promise<CliExecutionResult>,
): Promise<CliExecutionResult> {
  return runner(method.login.command, method.login.args);
}

export async function checkCliAuthStatus(
  method: CliAuthMethod,
  runner: (cmd: string, args: readonly string[]) => Promise<CliExecutionResult>,
): Promise<boolean> {
  const result = await runner(method.status.command, method.status.args);
  return result.success;
}
