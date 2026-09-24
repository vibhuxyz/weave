import type { VerificationRung } from "@weave/protocol";

export type EmployeeSource = "builtin" | "user" | "project";

export interface FilesystemPermissions {
  readonly read: readonly string[];
  readonly write: readonly string[];
}

export interface EmployeePermissions {
  readonly filesystem: FilesystemPermissions;
  readonly deployment: { readonly allowed: boolean };
  readonly network: { readonly allowed: boolean };
  readonly git: { readonly commit: boolean };
}

export interface EnginePolicy {
  readonly preferred: readonly string[];
  readonly allowed: readonly string[] | null;
}

export interface VerificationPolicy {
  readonly required: readonly VerificationRung[];
  readonly preferred: readonly VerificationRung[];
}

export interface MemoryPolicy {
  readonly enabled: boolean;
  readonly maxEntries: number;
  readonly recallCount: number;
}

export interface Employee {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly skills: readonly string[];
  readonly rules: readonly string[];
  readonly instructions: string;
  readonly permissions: EmployeePermissions;
  readonly capabilities: readonly string[];
  readonly engines: EnginePolicy;
  readonly verification: VerificationPolicy;
  readonly memory: MemoryPolicy;
  readonly source: EmployeeSource;
  readonly sourcePath: string | null;
}

export interface SkippedEmployee {
  readonly sourcePath: string;
  readonly reason: string;
}
