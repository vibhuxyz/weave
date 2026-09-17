export type {
  Command,
  CliAuthMethod,
  AcpAuthMethod,
  BrowserOAuthMethod,
  EnvironmentAuthMethod,
  NoneAuthMethod,
  AuthMethod,
  AgentSetupState,
} from "./auth/index.ts";

export {
  executeCliAuth,
  checkCliAuthStatus,
  executeAcpAuth,
  executeOAuthAuth,
  verifyEnvAuth,
} from "./auth/index.ts";

export type {
  AuthMethodInfo,
  AgentCapabilities,
  AgentDoctorResult,
  DoctorRunner,
} from "./doctor/index.ts";

export { runDoctor, isProviderReady } from "./doctor/index.ts";

export type {
  ProviderRuntime,
  AgentProvider,
  ProviderState,
} from "./registry/index.ts";

export {
  CURATED_PROVIDERS,
  findCuratedProvider,
  normalizeProviderId,
} from "./registry/index.ts";
