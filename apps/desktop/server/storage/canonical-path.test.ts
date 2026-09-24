import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalProjectPath } from "./canonical-path.ts";

async function workspace() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "weave-paths-")));
  const repo = join(root, "Repo");
  await mkdir(join(repo, "src"), { recursive: true });
  return { root, repo };
}

async function canonical(input: string): Promise<string | null> {
  const result = await canonicalProjectPath(input);
  return result.ok ? result.value : null;
}

test("trailing slashes, dot segments and symlinks resolve to one project path", async () => {
  const { root, repo } = await workspace();
  await symlink(repo, join(root, "link-to-repo"));
  assert.equal(await canonical(`${repo}/`), repo);
  assert.equal(await canonical(join(repo, "src", "..")), repo);
  assert.equal(await canonical(join(root, "link-to-repo")), repo);
});

test("on a case-insensitive disk, different letter case is the same project", { skip: process.platform !== "darwin" }, async () => {
  const { repo } = await workspace();
  const upper = repo.toUpperCase();
  assert.equal(await canonical(upper), repo);
});

test("a git worktree folder is its own project, separate from the main checkout", async () => {
  const { root, repo } = await workspace();
  const worktree = join(root, "Repo-worktrees", "feature-a");
  await mkdir(worktree, { recursive: true });
  await writeFile(join(worktree, ".git"), `gitdir: ${repo}/.git/worktrees/feature-a\n`);
  assert.equal(await canonical(worktree), worktree);
  assert.notEqual(await canonical(worktree), repo);
});

test("missing folders, files and relative paths are reported, not thrown", async () => {
  const { root, repo } = await workspace();
  await writeFile(join(root, "file.txt"), "x");
  for (const input of [join(root, "gone"), join(root, "file.txt"), "relative/path"]) {
    const result = await canonicalProjectPath(input);
    assert.equal(result.ok, false, input);
  }
  assert.equal(await canonical(repo), repo);
});
