export type { SessionContext } from "./types.ts";
export { registerLiveSupervisor, unregisterLiveSupervisor, killStaleSupervisors, sweepSupervisors, setupProcessCleanup } from "./cleanup.ts";
export { createSupervisorOptions } from "./supervisor-options.ts";
export type { CreateSupervisorInputs } from "./supervisor-options.ts";
export { DesktopSessionManager } from "./manager.ts";
