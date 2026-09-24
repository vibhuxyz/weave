import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinEmployees } from "./builtin/index.ts";
import { parseEmployee, parseYamlSubset, type RawEmployee } from "./config/index.ts";
import { PROJECT_EMPLOYEES_DIR, buildEmployeeRegistry, loadEmployeeRegistry } from "./registry/index.ts";

const SENIOR_BACKEND_YAML = `id: senior-backend-engineer

name: Senior Backend Engineer

responsibilities:
  - API development
  - backend architecture
  - database integration
  - performance

skills:
  - typescript
  - nodejs
  - postgres
  - redis
  - api-design

permissions:
  filesystem:
    read: ["**/*"]
    write:
      - "apps/api/**"

  deployment:
    allowed: false

verification:
  required:
    - typecheck
    - tests
`;

const project = (raw: Record<string, unknown>, sourcePath = `/p/${String(raw["id"])}.yaml`): RawEmployee => ({ raw, source: "project", sourcePath });

test("the example employee config parses into a complete employee with safe defaults", () => {
  const yaml = parseYamlSubset(SENIOR_BACKEND_YAML);
  assert.ok(yaml.ok);
  const parsed = parseEmployee(yaml.ok ? yaml.value : null, { source: "project", sourcePath: "senior.yaml" });
  assert.ok(parsed.ok, JSON.stringify(parsed));
  if (!parsed.ok) return;
  const { employee } = parsed;
  assert.equal(employee.name, "Senior Backend Engineer");
  assert.deepEqual(employee.skills, ["typescript", "nodejs", "postgres", "redis", "api-design"]);
  assert.deepEqual(employee.permissions.filesystem, { read: ["**/*"], write: ["apps/api/**"] });
  assert.deepEqual([employee.permissions.deployment.allowed, employee.permissions.git.commit, employee.permissions.network.allowed], [false, false, true]);
  assert.deepEqual(employee.verification, { required: ["typecheck", "tests"], preferred: [] });
  assert.deepEqual(employee.engines, { preferred: [], allowed: null });
  assert.equal(employee.memory.enabled, true);
});

test("invalid employee configs are refused with the reason, not half-loaded", () => {
  const bad = parseEmployee({ id: "Bad_Id", name: "x", salary: 1, verification: { required: ["vibes"] }, permissions: { filesystem: { write: ["../etc/**"] } } }, { source: "project", sourcePath: null });
  assert.equal(bad.ok, false);
  const issues = bad.ok ? "" : bad.issues.join("\n");
  assert.match(issues, /unknown field\(s\) salary/);
  assert.match(issues, /"vibes" is not a verification rung/);
  assert.match(issues, /"\.\.\/etc\/\*\*" must be a relative path inside the project/);
  assert.match(issues, /"id" has an invalid format/);
  assert.match((parseYamlSubset("permissions:\n  write: **/*").ok ? "" : "unsupported"), /unsupported/);
});

test("the six built-in employees are plain configs that pass the same parser", () => {
  const registry = buildEmployeeRegistry(builtinEmployees());
  assert.deepEqual(registry.skipped, []);
  assert.deepEqual(registry.employees.map((employee) => employee.id), ["backend-engineer", "database-engineer", "devops-engineer", "frontend-engineer", "qa-engineer", "security-engineer"]);
  assert.match(registry.byId.get("backend-engineer")?.instructions ?? "", /Role: Backend Engineer/);
  assert.equal(registry.byId.get("devops-engineer")?.permissions.deployment.allowed, false);
});

test("users override or extend built-ins; duplicates and cycles are reported, never silently dropped", () => {
  const registry = buildEmployeeRegistry([
    ...builtinEmployees(),
    project({ id: "backend-engineer", extends: "backend-engineer", permissions: { filesystem: { write: ["apps/api/**"] } } }),
    project({ id: "senior-backend-engineer", name: "Senior Backend", extends: "backend-engineer", skills: ["redis"] }),
    project({ id: "senior-backend-engineer", name: "Copy" }, "/p/zz-copy.yaml"),
    project({ id: "loop-a", name: "A", extends: "loop-b" }),
    project({ id: "loop-b", name: "B", extends: "loop-a" }),
  ]);
  const backend = registry.byId.get("backend-engineer");
  assert.equal(backend?.source, "project");
  assert.deepEqual(backend?.permissions.filesystem.write, ["apps/api/**"]);
  assert.match(backend?.instructions ?? "", /Role: Backend Engineer/);
  const senior = registry.byId.get("senior-backend-engineer");
  assert.deepEqual([senior?.name, senior?.skills, senior?.permissions.filesystem.write], ["Senior Backend", ["redis"], ["apps/api/**"]]);
  assert.deepEqual(registry.overridden, [{ id: "backend-engineer", by: "project", hidden: "builtin" }]);
  const reasons = registry.skipped.map((entry) => `${entry.sourcePath}: ${entry.reason}`).join("\n");
  assert.match(reasons, /zz-copy\.yaml: duplicate id senior-backend-engineer; kept \/p\/senior-backend-engineer\.yaml/);
  assert.match(reasons, /extends cycle loop-a -> loop-b -> loop-a/);
});

test("project employee files load from .weave/employees; escapes and unreadable files are skipped with a reason", async () => {
  const root = await mkdtemp(join(tmpdir(), "weave-employees-"));
  const dir = join(root, PROJECT_EMPLOYEES_DIR);
  await mkdir(dir, { recursive: true });
  const outside = join(root, "outside.yaml");
  await writeFile(outside, "id: sneaky\nname: Sneaky\n");
  await Promise.all([
    writeFile(join(dir, "senior-backend-engineer.yaml"), SENIOR_BACKEND_YAML),
    writeFile(join(dir, "reviewer.json"), JSON.stringify({ id: "reviewer", name: "Reviewer", permissions: { filesystem: { write: ["docs/**"] } } })),
    writeFile(join(dir, "broken.yml"), "id: broken\n  name: nope\n"),
    writeFile(join(dir, "notes.txt"), "ignored"),
    symlink(outside, join(dir, "escape.yaml")),
  ]);
  const registry = await loadEmployeeRegistry({ projectRoot: root, includeBuiltins: false });
  assert.deepEqual(registry.employees.map((employee) => employee.id), ["reviewer", "senior-backend-engineer"]);
  const skipped = registry.skipped.map((entry) => entry.reason).sort();
  assert.equal(skipped.length, 2);
  assert.match(skipped[0] ?? "", /Cannot parse employee file: line 2: unexpected indentation/);
  assert.match(skipped[1] ?? "", /resolves outside/);
});
