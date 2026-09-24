import { BACKEND_ENGINEER, DATABASE_ENGINEER, FRONTEND_ENGINEER } from "./engineering.ts";
import { DEVOPS_ENGINEER, QA_ENGINEER, SECURITY_ENGINEER } from "./operations.ts";

export interface EmployeeSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly skills: readonly string[];
  readonly rules: readonly string[];
  readonly instructions: string;
}

const BUILTIN_CONFIGS = [
  BACKEND_ENGINEER, FRONTEND_ENGINEER, DEVOPS_ENGINEER, QA_ENGINEER, SECURITY_ENGINEER, DATABASE_ENGINEER,
] as const;

export const BUILTIN_EMPLOYEE_SUMMARIES: readonly EmployeeSummary[] = BUILTIN_CONFIGS.map((config) => ({
  id: config.id,
  name: config.name,
  description: config.description,
  responsibilities: config.responsibilities,
  skills: config.skills,
  rules: config.rules,
  instructions: config.instructions,
}));
