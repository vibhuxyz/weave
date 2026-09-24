import { isRecord, readOptionalString, readPattern, readString, type FieldContext } from "../../shared/index.ts";
import { EMPLOYEE_ID_PATTERN, type Employee, type EmployeeSource } from "../model/index.ts";
import { MAX_INSTRUCTIONS_CHARS, MAX_NAME_CHARS, MAX_TEXT_CHARS } from "../model/constants.ts";
import { readEnginePolicy, readList, readMemory, readPermissions, readVerification } from "./parse-sections.ts";

export type ParseEmployeeResult = { readonly ok: true; readonly employee: Employee } | { readonly ok: false; readonly issues: readonly string[] };

export interface EmployeeOrigin {
  readonly source: EmployeeSource;
  readonly sourcePath: string | null;
}

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "id", "name", "description", "extends", "responsibilities", "skills", "rules", "instructions",
  "permissions", "capabilities", "engines", "verification", "memory",
]);

export function parseEmployee(raw: unknown, origin: EmployeeOrigin): ParseEmployeeResult {
  if (!isRecord(raw)) return { ok: false, issues: ["An employee must be a map of fields"] };
  const issues: string[] = [];
  const where = typeof raw["id"] === "string" ? `employee ${raw["id"]}` : "employee";
  const ctx: FieldContext = { record: raw, where, issues };
  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key)).sort();
  if (unknown.length > 0) issues.push(`${where}: unknown field(s) ${unknown.join(", ")}`);
  const id = readPattern(ctx, "id", EMPLOYEE_ID_PATTERN);
  const name = readString(ctx, "name", MAX_NAME_CHARS);
  const employee = {
    description: readOptionalString(ctx, "description", MAX_TEXT_CHARS) ?? "",
    responsibilities: readList(ctx, "responsibilities"),
    skills: readList(ctx, "skills"),
    rules: readList(ctx, "rules"),
    instructions: readOptionalString(ctx, "instructions", MAX_INSTRUCTIONS_CHARS) ?? "",
    permissions: readPermissions(ctx),
    capabilities: readList(ctx, "capabilities"),
    engines: readEnginePolicy(ctx),
    verification: readVerification(ctx),
    memory: readMemory(ctx),
    ...origin,
  };
  if (issues.length > 0 || id === null || name === null) return { ok: false, issues };
  return { ok: true, employee: { id, name, ...employee } };
}
