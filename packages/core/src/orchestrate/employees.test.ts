import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadEmployeeRegistry, prepareEmployees } from "../employees/index.ts";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { Ledger, readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { planAndRun } from "./plan-and-run.ts";
import type { TurnRunner } from "./types.ts";

const SENIOR = `id: senior-backend-engineer
name: Senior Backend Engineer
extends: backend-engineer
responsibilities:
  - API development
  - payouts
permissions:
  filesystem:
    write:
      - "apps/api/**"
verification:
  required: [tests]
`;
const DOCS = `id: docs-writer
name: Docs Writer
responsibilities: [documentation]
permissions:
  filesystem:
    write: ["docs/**"]
verification:
  required: [lint]
`;

async function project(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-staff-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "package-lock.json"), "{}");
  await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node -e 0" } }));
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const employees = join(repo, ".weave", "employees");
  await mkdir(employees, { recursive: true });
  await writeFile(join(employees, "senior-backend-engineer.yaml"), SENIOR);
  await writeFile(join(employees, "docs-writer.yaml"), DOCS);
  return repo;
}

const plan = {
  tasks: [
    { id: "T1", title: "Payouts API", prompt: "Add API development for seller payouts", allowedPaths: ["apps/api/payouts.js"] },
    { id: "T2", title: "Payout docs", prompt: "Document payouts", allowedPaths: ["docs/payouts.md"], employee: "docs-writer" },
  ],
};
const decision = '```json\n{ "taskNotes": { "decisions": ["Payout amounts are integer paise"] } }\n```';
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["tests"], detail: "ok" });

test("employees are staffed from config, bound by their permissions and verification, and remember what they learned", async () => {
  const repo = await project();
  const prompts: string[] = [];
  const runTurn: TurnRunner = async (prompt) => (prompts.push(prompt), `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``);
  const seen = new Map<string, { employee?: string; deployment?: boolean }>();
  const worker: RunWorker = async ({ task }) => {
    seen.set(task.id, { employee: task.employee, deployment: task.policy?.deployment?.allowed });
    const file = join(task.cwd, task.allowedPaths?.[0] ?? "x");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, task.id);
    return { status: "ok", finalMessage: task.id === "T1" ? decision : "done" };
  };
  const result = await planAndRun({ request: "payouts", repoRoot: repo, runTurn, runWorker: worker, verify: verifyOk, shouldInstall: false, employees: {} });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.match(prompts[0] ?? "", /<employee-roster>[\s\S]*- docs-writer: Docs Writer — documentation; writes docs\/\*\*/);
  assert.match(prompts[0] ?? "", /- senior-backend-engineer: Senior Backend Engineer — API development, payouts; writes apps\/api\/\*\*[\s\S]*<\/employee-roster>/);
  assert.deepEqual(result.assignments.map((assignment) => [assignment.taskId, assignment.employee?.id]), [["T1", "senior-backend-engineer"], ["T2", "docs-writer"]]);
  assert.deepEqual(seen.get("T1"), { employee: "senior-backend-engineer", deployment: false });
  const statuses = result.report.pool.tasks.map((entry) => [entry.taskId, entry.status]);
  assert.deepEqual(statuses, [["T1", "ok"], ["T2", "failed"]]);
  assert.match(result.report.pool.tasks[1]?.reason ?? "", /Docs Writer verification policy failed: required rung lint is not available/);

  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const verified = events.flatMap((event) => (event.type === "employee.verified" ? [[event.employeeId, event.ok]] : []));
  assert.deepEqual(verified.sort(), [["docs-writer", false], ["senior-backend-engineer", true]]);

  const registry = await loadEmployeeRegistry({ projectRoot: repo });
  const next = await prepareEmployees({
    tasks: [{ id: "N1", title: "Payout fees", prompt: "Change payout amounts for API development", cwd: repo, allowedPaths: ["apps/api/fees.js"] }],
    registry, ledger: new Ledger(join(repo, ".weave"), "next"), weaveDir: join(repo, ".weave"), configuredEngines: ["claude-code"],
  });
  assert.match(next.briefings.get("N1") ?? "", /<employee id="senior-backend-engineer" source="project">[\s\S]*<employee-memory employee="senior-backend-engineer">[\s\S]*Payout amounts are integer paise/);
});
