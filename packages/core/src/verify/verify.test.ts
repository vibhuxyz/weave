import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { intake } from "../intake/index.ts";
import { planVerification } from "./ladder.ts";
import { runLadder } from "./run-ladder.ts";

type Files = Readonly<Record<string, string>>;

async function repoWith(files: Files): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "weave-verify-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

function commandsFor(detected: Awaited<ReturnType<typeof intake>>["detected"]): Record<string, string> {
  return Object.fromEntries(
    detected.flatMap((entry) => (entry.execution.via === "command" ? [[entry.rung, entry.execution.command]] : [])),
  );
}

test("a python project is verified with pytest, ruff and mypy", async () => {
  const dir = await repoWith({ "pyproject.toml": "[project]\nname='svc'\n", "src/svc/main.py": "x = 1\n" });
  const commands = commandsFor((await intake(dir)).detected);
  assert.equal(commands["tests"], "pytest -q");
  assert.equal(commands["lint"], "ruff check .");
  assert.equal(commands["typecheck"], "mypy .");
});

test("poetry and uv projects get their runner prefix", async () => {
  const poetry = await repoWith({ "pyproject.toml": "[project]\n", "poetry.lock": "#\n" });
  assert.equal(commandsFor((await intake(poetry)).detected)["tests"], "poetry run pytest -q");

  const uv = await repoWith({ "pyproject.toml": "[project]\n", "uv.lock": "#\n" });
  assert.equal(commandsFor((await intake(uv)).detected)["tests"], "uv run pytest -q");
});

test("a go project is verified with go test and go vet", async () => {
  const dir = await repoWith({ "go.mod": "module example.com/api\n\ngo 1.23\n", "main.go": "package main\n" });
  const commands = commandsFor((await intake(dir)).detected);
  assert.equal(commands["tests"], "go test ./...");
  assert.equal(commands["lint"], "go vet ./...");
  assert.equal(commands["build"], "go build ./...");
});

test("rust, maven, gradle and ruby projects each get their own commands", async () => {
  const rust = commandsFor((await intake(await repoWith({ "Cargo.toml": "[package]\n" }))).detected);
  assert.equal(rust["tests"], "cargo test");
  assert.equal(rust["lint"], "cargo clippy -- -D warnings");

  const maven = commandsFor((await intake(await repoWith({ "pom.xml": "<project/>\n" }))).detected);
  assert.equal(maven["tests"], "mvn -q test");

  const gradle = commandsFor((await intake(await repoWith({ "build.gradle": "plugins {}\n", gradlew: "#!/bin/sh\n" }))).detected);
  assert.equal(gradle["tests"], "./gradlew test");

  const ruby = commandsFor((await intake(await repoWith({ Gemfile: "source 'https://rubygems.org'\n", ".rubocop.yml": "\n" }))).detected);
  assert.equal(ruby["tests"], "bundle exec rspec");
  assert.equal(ruby["lint"], "bundle exec rubocop");
});

test("a node project keeps its own scripts, and the losing command is reported not dropped", async () => {
  const dir = await repoWith({
    "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
    "pyproject.toml": "[project]\n",
  });
  const detected = await intake(dir);
  assert.equal(commandsFor(detected.detected)["tests"], "npm run --silent test");
  const displaced = detected.missing.find((entry) => entry.rung === "tests");
  assert.ok(displaced, "the python suite must be reported, not silently dropped");
  assert.match(displaced.why, /pytest -q.*already covers tests/);
});

test("an unknown project still reports why each rung is missing", async () => {
  const detected = await intake(await repoWith({ "notes.txt": "hello\n" }));
  assert.deepEqual(detected.detected.map((entry) => entry.rung), ["diff-review"]);
  assert.ok(detected.missing.length > 0);
  assert.ok(detected.missing.every((entry) => entry.why.length > 0));
});

test("verification is layered from the changed files outwards, not the whole repository first", async () => {
  const dir = await repoWith({ "go.mod": "module example.com/api\n\ngo 1.23\n" });
  const detected = await intake(dir);
  const plan = planVerification({
    cwd: dir,
    intake: detected,
    changedFiles: ["internal/auth/session.go"],
    relatedFiles: ["internal/tokens/issue.go"],
  });

  assert.deepEqual(
    plan.steps.map((step) => [step.layer, step.command]),
    [
      ["task", "go test ./internal/auth/..."],
      ["integration", "go test ./internal/tokens/..."],
      ["build", "go build ./..."],
      ["repository", "go test ./..."],
    ],
  );
});

test("a project with no scoped test command says so instead of pretending", async () => {
  const dir = await repoWith({ "Cargo.toml": "[package]\n" });
  const plan = planVerification({ cwd: dir, intake: await intake(dir), changedFiles: ["src/auth.rs"] });
  const task = plan.skipped.find((entry) => entry.layer === "task");
  assert.ok(task);
  assert.match(task.why, /no path-scoped test command/);
  assert.ok(plan.steps.some((step) => step.layer === "repository"));
});

test("the ladder stops at the cheapest failing layer and reports what it did not run", async () => {
  const dir = await repoWith({ "go.mod": "module x\n" });
  const detected = await intake(dir);
  const plan = {
    steps: [
      { layer: "task" as const, rung: "tests" as const, command: "exit 0", why: "narrow" },
      { layer: "integration" as const, rung: "tests" as const, command: "exit 1", why: "related" },
      { layer: "repository" as const, rung: "tests" as const, command: "exit 0", why: "everything" },
    ],
    skipped: [],
  };
  const outcome = await runLadder(plan, dir, detected);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.stoppedAt, "integration");
  assert.deepEqual(outcome.runs.map((run) => run.layer), ["task", "integration"]);
  assert.deepEqual(outcome.notRun.map((step) => step.layer), ["repository"]);
});

test("a ladder that passes every layer reports the rungs it used", async () => {
  const dir = await repoWith({ "go.mod": "module x\n" });
  const detected = await intake(dir);
  const outcome = await runLadder(
    { steps: [{ layer: "task", rung: "tests", command: "exit 0", why: "narrow" }], skipped: [] },
    dir,
    detected,
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stoppedAt, null);
  assert.deepEqual(outcome.verification.used, ["tests"]);
});
