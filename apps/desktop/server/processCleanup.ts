import type { EngineSupervisor } from "@weave/agent";

const liveSupervisors = new Set<EngineSupervisor>();
let isSweeping = false;

export function registerLiveSupervisor(supervisor: EngineSupervisor): void {
  liveSupervisors.add(supervisor);
}

export function unregisterLiveSupervisor(supervisor: EngineSupervisor): void {
  liveSupervisors.delete(supervisor);
}

export function sweepSupervisors(): void {
  if (isSweeping) return;
  isSweeping = true;
  for (const supervisor of liveSupervisors) {
    supervisor.killAll();
  }
  liveSupervisors.clear();
}

process.on("exit", sweepSupervisors);

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    sweepSupervisors();
    process.exit(0);
  });
}
