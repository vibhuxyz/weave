import type { ContractLanguage } from "./render/index.ts";

export interface ContractFile {
  path: string;
  content: string;
}

export interface Contract {
  version: number;
  language: ContractLanguage;
  entryPath: string;
  files: ContractFile[];
  exports: string[];
}

export interface ContractChangeRequest {
  from: string;
  to: string;
  reason: string;
  affects: string[];
}

export type ParseContractChangeResult =
  | { ok: true; request: ContractChangeRequest }
  | { ok: false; issues: string[] };

export interface ContractImpact {
  notify: string[];
  rerun: string[];
}
