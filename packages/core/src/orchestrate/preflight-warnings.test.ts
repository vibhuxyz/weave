import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../worktree/index.ts";
import { planAndRun } from "./plan-and-run.ts";

async function committedProject(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-preflight-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\nnode_modules/\n");
  await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

test("files missing from the last commit are named to the user and to the planner before planning", async () => {
  const repo = await committedProject();
  await mkdir(join(repo, "src", "api"), { recursive: true });
  await writeFile(join(repo, "src", "api", "app.ts"), "export const app = 1;\n");
  const answer = "```json\n" + JSON.stringify({ tasks: [{ id: "T1", title: "fix", prompt: "fix the api", allowedPaths: ["src/api/**"] }] }) + "\n```";
  const prompts: string[] = [];
  const warnings: string[] = [];
  const result = await planAndRun({
    request: "fix the bug in the api handlers and the ui client",
    repoRoot: repo,
    runTurn: async (prompt) => (prompts.push(prompt), answer),
    runWorker: async () => ({ status: "ok" }),
    shouldInstall: false,
    approvePlan: async () => false,
    onEvent: (event) => {
      if (event.type === "plan.reviewed") warnings.push(...event.warnings);
    },
  });
  assert.equal(result.status, "refused");
  assert.match(warnings[0] ?? "", /^1 file\(s\) are not committed, so the planner cannot open them\.[^\n]*Files: src\/api\/app\.ts$/);
  assert.match(prompts[0] ?? "", /<preflight-warnings source="Weave: checked with git before planning">\n1 file\(s\) are not committed[^\n]*Files: src\/api\/app\.ts/);
});
