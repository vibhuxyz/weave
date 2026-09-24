import type { RawEmployee } from "../config/index.ts";
import { BACKEND_ENGINEER, DATABASE_ENGINEER, FRONTEND_ENGINEER } from "./engineering.ts";
import { DEVOPS_ENGINEER, QA_ENGINEER, SECURITY_ENGINEER } from "./operations.ts";

const BUILTIN_CONFIGS: readonly Readonly<Record<string, unknown>>[] = [
  BACKEND_ENGINEER, FRONTEND_ENGINEER, DEVOPS_ENGINEER, QA_ENGINEER, SECURITY_ENGINEER, DATABASE_ENGINEER,
];

export function builtinEmployees(): readonly RawEmployee[] {
  return BUILTIN_CONFIGS.map((raw) => ({ raw: structuredClone(raw), source: "builtin", sourcePath: null }));
}
