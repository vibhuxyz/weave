import type { ProjectModel, Workspace } from "../types.ts";
import { wordsOf } from "../words/index.ts";
import type { VerificationStep } from "./types.ts";

const SCRIPT_ORDER = ["typecheck", "lint", "test", "build"];
const MAX_TESTS = 10;

export function relevantTests(model: ProjectModel, files: ReadonlySet<string>, terms: readonly string[]): readonly string[] {
  const tests = new Set(model.files.filter((file) => file.kind === "test").map((file) => file.path));
  const importing = model.dependencies.internal.filter((edge) => tests.has(edge.from) && files.has(edge.to)).map((edge) => edge.from);
  const named = [...tests].filter((path) => {
    const words = new Set(wordsOf(path));
    return terms.length > 0 && terms.every((term) => words.has(term));
  });
  return [...new Set([...importing, ...named])].sort().slice(0, MAX_TESTS);
}

export function verificationCommands(model: ProjectModel, workspaces: readonly Workspace[]): readonly VerificationStep[] {
  const runner = model.stack.packageManager ?? "npm";
  return workspaces.flatMap((workspace) =>
    SCRIPT_ORDER.filter((script) => workspace.scripts.includes(script)).map((script) => ({ command: `${runner} run ${script}`, cwd: workspace.dir })),
  );
}
