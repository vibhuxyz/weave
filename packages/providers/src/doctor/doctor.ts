import type { AgentDoctorResult } from "./types.ts";

export interface DoctorRunner {
  (providerId: string): Promise<AgentDoctorResult>;
}

export async function runDoctor(
  providerId: string,
  runner: DoctorRunner,
): Promise<AgentDoctorResult> {
  return runner(providerId);
}

export function isProviderReady(result: AgentDoctorResult): boolean {
  return result.installed && result.authenticated && result.usable;
}
