import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "@weave/core";
import { DEFAULT_GITIGNORE_LINES, FALLBACK_AUTHOR_EMAIL, INITIAL_COMMIT_MESSAGE } from "./constants.ts";
import { initializeRepo } from "./initialize-repo.ts";
import { prepareRepo } from "./prepare-repo.ts";

const NO_GLOBAL_CONFIG = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } as const;

function withoutGlobalGitConfig<T>(body: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(NO_GLOBAL_CONFIG).map((key) => [key, process.env[key]]));
  Object.assign(process.env, NO_GLOBAL_CONFIG);
  return body().finally(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function folderWithFiles(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "weave-git-setup-"));
  await writeFile(join(dir, "index.js"), "console.log(1);\n");
  return dir;
}

async function git(dir: string, args: readonly string[]): Promise<string> {
  const run = await runGit(dir, args);
  assert.ok(run.ok, run.output);
  return run.output.trim();
}

test("a plain folder is reported, not changed, until setup is asked for", async () => {
  const dir = await folderWithFiles();
  const check = await prepareRepo(dir, { shouldSetUp: false });
  assert.ok(!check.ok && check.needsSetup);
  assert.match(check.reason, /is not a git repository/);
  assert.equal((await runGit(dir, ["rev-parse", "--is-inside-work-tree"])).ok, false);
});

test("setup creates the repository, a .gitignore and a first commit holding the project files", async () => {
  const dir = await folderWithFiles();
  await withoutGlobalGitConfig(async () => {
    assert.deepEqual(await prepareRepo(dir, { shouldSetUp: true }), { ok: true });
    assert.deepEqual((await git(dir, ["ls-files"])).split("\n"), [".gitignore", "index.js"]);
    assert.equal(await git(dir, ["log", "-1", "--format=%s %ae"]), `${INITIAL_COMMIT_MESSAGE} ${FALLBACK_AUTHOR_EMAIL}`);
    assert.equal((await runGit(dir, ["config", "--local", "user.email"])).ok, false);
  });
  assert.equal(await readFile(join(dir, ".gitignore"), "utf8"), `${DEFAULT_GITIGNORE_LINES.join("\n")}\n`);
  assert.deepEqual(await prepareRepo(dir, { shouldSetUp: false }), { ok: true });
});

test("a repository with no commits keeps its own .gitignore and gets a first commit", async () => {
  const dir = await folderWithFiles();
  await git(dir, ["init", "--quiet"]);
  await writeFile(join(dir, ".gitignore"), "secret.txt\n");
  await writeFile(join(dir, "secret.txt"), "shh");
  await withoutGlobalGitConfig(() => prepareRepo(dir, { shouldSetUp: true }));
  assert.equal(await readFile(join(dir, ".gitignore"), "utf8"), "secret.txt\n");
  assert.deepEqual((await git(dir, ["ls-files"])).split("\n"), [".gitignore", "index.js"]);
});

test("the home folder is never turned into a repository", async () => {
  const setup = await initializeRepo(homedir(), "no-repo");
  assert.ok(!setup.ok);
  assert.match(setup.reason, /will not turn/);
});
