import type { EngineSupervisor } from "@weave/agent";

const liveSupervisors = new Set<EngineSupervisor>();
let isSweeping = false;

export function registerLiveSupervisor(supervisor: EngineSupervisor): void {
  liveSupervisors.add(supervisor);
}

export function unregisterLiveSupervisor(supervisor: EngineSupervisor): void {
  liveSupervisors.delete(supervisor);
}

/**
 * Stop every engine a previous connection left running.
 *
 * agy keeps one conversation store per workspace, shared by every `agy`
 * attached to it. A second engine on the same project answers the first one's
 * tool confirmation — agy logs "confirmation at step N was resolved by another
 * client" — and the first one's tool call then sits at `pending` forever. One
 * live engine per server is the only arrangement that works.
 */
export function killStaleSupervisors(): void {
  for (const supervisor of liveSupervisors) {
    supervisor.killAll();
  }
  liveSupervisors.clear();
}

export function sweepSupervisors(): void {
  if (isSweeping) return;
  isSweeping = true;
  for (const supervisor of liveSupervisors) {
    supervisor.killAll();
  }
  liveSupervisors.clear();
}

export function setupProcessCleanup(): void {
  process.on("exit", sweepSupervisors);

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(signal, () => {
      sweepSupervisors();
      process.exit(0);
    });
  }
}
