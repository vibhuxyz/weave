import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { isNotFound, parseBudgets, type Budgets } from "@weave/core";
import { errorMessage } from "../shared/index.ts";
import { BUDGETS_FILE_NAME, MAX_BUDGETS_FILE_BYTES, WEAVE_DIR_NAME } from "./constants.ts";
import { budgetSettings } from "./settings.ts";

export type BudgetLoad = { readonly ok: true; readonly budgets: Budgets } | { readonly ok: false; readonly message: string };
export type BudgetSave = { readonly ok: true } | { readonly ok: false; readonly message: string };

const RELATIVE_PATH = join(WEAVE_DIR_NAME, BUDGETS_FILE_NAME);

function budgetsPath(projectDir: string): string {
  return join(projectDir, RELATIVE_PATH);
}

async function resolvedInside(projectDir: string, path: string): Promise<string | null> {
  const resolved = await realpath(path).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (resolved === null) return null;
  const root = await realpath(projectDir);
  if (!resolved.startsWith(`${root}${sep}`)) throw new Error(`${RELATIVE_PATH} resolves outside the project, to ${resolved}`);
  return resolved;
}

function parseText(text: string): BudgetLoad {
  try {
    const parsed = parseBudgets(JSON.parse(text));
    return parsed.ok ? { ok: true, budgets: parsed.budgets } : { ok: false, message: `${RELATIVE_PATH} is invalid: ${parsed.issues.join("; ")}` };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, message: `${RELATIVE_PATH} is not valid JSON: ${error.message}` };
    throw error;
  }
}

export async function loadBudgets(projectDir: string): Promise<BudgetLoad> {
  try {
    const path = await resolvedInside(projectDir, budgetsPath(projectDir));
    if (path === null) return { ok: true, budgets: {} };
    const info = await stat(path);
    if (info.size > MAX_BUDGETS_FILE_BYTES) return { ok: false, message: `${RELATIVE_PATH} is ${info.size} bytes, over ${MAX_BUDGETS_FILE_BYTES}` };
    return parseText(await readFile(path, "utf8"));
  } catch (error) {
    return { ok: false, message: `Cannot read ${RELATIVE_PATH}: ${errorMessage(error)}` };
  }
}

export async function saveBudgets(projectDir: string, settings: unknown): Promise<BudgetSave> {
  const parsed = parseBudgets(settings);
  if (!parsed.ok) return { ok: false, message: `Cannot save limits: ${parsed.issues.join("; ")}` };
  try {
    await mkdir(join(projectDir, WEAVE_DIR_NAME), { recursive: true });
    const path = (await resolvedInside(projectDir, budgetsPath(projectDir))) ?? budgetsPath(projectDir);
    await writeFile(path, `${JSON.stringify(budgetSettings(parsed.budgets), null, 2)}\n`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `Cannot save ${RELATIVE_PATH}: ${errorMessage(error)}` };
  }
}
