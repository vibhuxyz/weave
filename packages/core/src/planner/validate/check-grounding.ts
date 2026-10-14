import type { PlanValidationContext, ReviewedTask } from "./types.ts";

const MAX_LISTED = 12;
const PACKAGE_BINARIES = ["pnpm", "yarn", "bun", "bunx", "npm", "npx"] as const;

function listed(names: readonly string[]): string {
  const shown = names.slice(0, MAX_LISTED).join(", ");
  return names.length > MAX_LISTED ? `${shown} (+${names.length - MAX_LISTED} more)` : shown;
}

function staticRoot(glob: string): string {
  const star = glob.indexOf("*");
  return (star === -1 ? glob : glob.slice(0, star)).replace(/\/+$/, "");
}

function covers(glob: string, file: string): boolean {
  const root = staticRoot(glob);
  if (root === "" || root === ".") return true;
  return file === root || file.startsWith(`${root}/`);
}

function familyOf(binary: string): string {
  if (binary === "bun" || binary === "bunx") return "bun";
  if (binary === "npm" || binary === "npx") return "npm";
  return binary;
}

function familiesIn(command: string): readonly string[] {
  const tokens = command.split(/[\s;&|()]+/);
  return [...new Set(tokens.filter((token) => (PACKAGE_BINARIES as readonly string[]).includes(token)).map(familyOf))];
}

function uncoveredAnchors(tasks: readonly ReviewedTask[], context: PlanValidationContext): readonly string[] {
  const anchors = context.anchorFiles;
  if (anchors == null || anchors.length === 0) return [];
  const symbolsByFile = new Map<string, string[]>();
  for (const anchor of anchors) {
    const names = symbolsByFile.get(anchor.file) ?? [];
    if (!names.includes(anchor.symbol)) names.push(anchor.symbol);
    symbolsByFile.set(anchor.file, names);
  }
  return [...symbolsByFile]
    .filter(([file]) => !tasks.some((task) => (task.allowedPaths ?? []).some((glob) => covers(glob, file))))
    .slice(0, MAX_LISTED)
    .map(([file, names]) => `No task may write ${file}, which defines ${listed(names)}. Add that path to the task that owns the change.`);
}

function wrongPackageManager(tasks: readonly ReviewedTask[], context: PlanValidationContext): readonly string[] {
  const manager = context.packageManager;
  if (manager == null || manager === "") return [];
  const expected = familyOf(manager);
  return tasks.flatMap((task) => {
    if (task.verify === undefined) return [];
    const wrong = familiesIn(task.verify).filter((family) => family !== expected);
    return wrong.length === 0 ? [] : [`Task ${task.id} verifies with ${listed(wrong)}, but this project uses ${expected}`];
  });
}

export function groundingErrors(tasks: readonly ReviewedTask[], context: PlanValidationContext): readonly string[] {
  return [...uncoveredAnchors(tasks, context), ...wrongPackageManager(tasks, context)];
}
