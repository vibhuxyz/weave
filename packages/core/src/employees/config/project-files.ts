import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { isNotFound, isRecord, parseJsonBlock } from "../../shared/index.ts";
import { EMPLOYEE_ID_PATTERN, type Employee } from "../model/index.ts";
import { employeeToYaml } from "./serialize-employee.ts";
import { parseYamlSubset } from "./yaml-subset.ts";

export const EMPLOYEES_SUBDIR = join(".weave", "employees");
const EMPLOYEE_EXTENSIONS: ReadonlySet<string> = new Set([".yaml", ".yml", ".json"]);

export type EmployeeFileResult = { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string };

async function employeesDir(projectRoot: string): Promise<string> {
  const dir = join(projectRoot, EMPLOYEES_SUBDIR);
  await mkdir(dir, { recursive: true });
  const [root, resolved] = await Promise.all([realpath(projectRoot), realpath(dir)]);
  if (resolved !== join(root, EMPLOYEES_SUBDIR)) throw new Error(`Refusing ${dir}: it resolves outside ${root}`);
  return resolved;
}

async function idOf(path: string): Promise<string | null> {
  const text = await readFile(path, "utf8");
  const parsed = extname(path) === ".json" ? parseJsonBlock(text) : parseYamlSubset(text);
  const id = parsed.ok && isRecord(parsed.value) ? parsed.value["id"] : null;
  return typeof id === "string" ? id : null;
}

async function filesFor(dir: string, employeeId: string): Promise<readonly string[]> {
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && EMPLOYEE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
  const ids = await Promise.all(names.map(async (name) => [join(dir, name), await idOf(join(dir, name))] as const));
  return ids.filter(([, id]) => id === employeeId).map(([path]) => path);
}

export async function saveProjectEmployee(projectRoot: string, employee: Employee): Promise<EmployeeFileResult> {
  if (!EMPLOYEE_ID_PATTERN.test(employee.id)) return { ok: false, reason: `Invalid employee id ${JSON.stringify(employee.id)}` };
  const dir = await employeesDir(projectRoot);
  const existing = await filesFor(dir, employee.id);
  const target = join(dir, `${employee.id}.yaml`);
  await writeFile(target, employeeToYaml(employee));
  await Promise.all(existing.filter((path) => path !== target).map((path) => rm(path)));
  return { ok: true, path: target };
}

export async function deleteProjectEmployee(projectRoot: string, employeeId: string): Promise<EmployeeFileResult> {
  if (!EMPLOYEE_ID_PATTERN.test(employeeId)) return { ok: false, reason: `Invalid employee id ${JSON.stringify(employeeId)}` };
  const dir = await employeesDir(projectRoot).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  const files = dir ? await filesFor(dir, employeeId) : [];
  if (files.length === 0) return { ok: false, reason: `No project file defines employee ${employeeId}; built-ins cannot be deleted, only overridden` };
  await Promise.all(files.map((path) => rm(path)));
  return { ok: true, path: files[0] ?? dir ?? projectRoot };
}
