export interface Command {
  readonly command: string;
  readonly args: readonly string[];
}

export interface CliAuthMethod {
  readonly type: "cli_auth";
  readonly login: Command;
  readonly status: Command;
}

export interface AcpAuthMethod {
  readonly type: "acp_auth";
  readonly server: Command;
  readonly preferredMethodId?: string;
}

export interface BrowserOAuthMethod {
  readonly type: "browser_oauth";
  readonly startUrl: string;
}

export interface EnvironmentAuthMethod {
  readonly type: "environment";
  readonly requiredKeys: readonly string[];
}

export interface NoneAuthMethod {
  readonly type: "none";
}

export type AuthMethod =
  | CliAuthMethod
  | AcpAuthMethod
  | BrowserOAuthMethod
  | EnvironmentAuthMethod
  | NoneAuthMethod;

export type AgentSetupState =
  | { readonly state: "checking"; readonly provider: string }
  | { readonly state: "not_installed"; readonly provider: string; readonly error?: string }
  | {
      readonly state: "auth_required";
      readonly provider: string;
      readonly methods?: readonly {
        readonly id: string;
        readonly name: string;
        readonly description?: string;
      }[];
    }
  | { readonly state: "authenticating"; readonly provider: string; readonly methodId?: string }
  | {
      readonly state: "authenticated";
      readonly provider: string;
      readonly capabilities?: {
        readonly models: boolean;
        readonly reasoning: boolean;
        readonly tools: boolean;
        readonly sessions: boolean;
      };
    }
  | { readonly state: "failed"; readonly provider: string; readonly error: string };
