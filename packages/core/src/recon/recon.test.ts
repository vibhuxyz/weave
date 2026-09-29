import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GO_REPO,
  JAVA_REPO,
  NEXTJS_REPO,
  PLAIN_REPO,
  PYTHON_REPO,
  RUST_REPO,
  writeRepo,
  type RepoFiles,
} from "./fixtures.ts";
import { profileRepository } from "./profile.ts";
import { summarizeProfile } from "./summary.ts";
import type { Detection, RepositoryProfile } from "./types.ts";

async function profileOf(files: RepoFiles): Promise<{ profile: RepositoryProfile; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "weave-recon-"));
  await writeRepo(dir, files);
  return { profile: await profileRepository(dir), dir };
}

function names(detections: readonly Detection[]): string[] {
  return detections.map((detection) => detection.name);
}

async function withRepo(
  files: RepoFiles,
  check: (profile: RepositoryProfile) => void,
): Promise<void> {
  const { profile, dir } = await profileOf(files);
  try {
    check(profile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a Next.js monorepo is profiled from its manifests, lockfile and layout", async () => {
  await withRepo(NEXTJS_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.equal(summary.languages[0], "typescript");
    assert.deepEqual(summary.frameworks, ["nextjs", "react"]);
    assert.equal(summary.packageManager, "pnpm");
    assert.deepEqual(summary.databases, ["postgresql"]);
    assert.deepEqual(summary.orms, ["prisma"]);
    assert.deepEqual(summary.tests, ["playwright", "vitest"]);
    assert.equal(summary.containerized, true);
    assert.deepEqual(summary.ci, ["github-actions"]);
    assert.equal(summary.monorepo, true);
    assert.deepEqual(profile.monorepo.evidence, ["apps and packages", "pnpm-workspace.yaml"]);
    assert.deepEqual(profile.layout.sourceDirectories, ["apps", "packages"]);
    assert.equal(profile.layout.hasReadme, true);
  });
});

test("a Python service is profiled from pyproject and poetry", async () => {
  await withRepo(PYTHON_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.deepEqual(summary.languages, ["python"]);
    assert.deepEqual(summary.frameworks, ["fastapi"]);
    assert.equal(summary.packageManager, "poetry");
    assert.deepEqual(summary.orms, ["sqlalchemy"]);
    assert.deepEqual(summary.tests, ["pytest"]);
    assert.equal(summary.containerized, false);
    assert.equal(summary.monorepo, false);
    assert.deepEqual(profile.layout.sourceDirectories, ["src", "tests"]);
  });
});

test("a Go service is profiled from go.mod require lines", async () => {
  await withRepo(GO_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.deepEqual(summary.languages, ["go"]);
    assert.deepEqual(summary.frameworks, ["gin"]);
    assert.equal(summary.packageManager, "go-modules");
    assert.deepEqual(summary.databases, ["postgresql"]);
    assert.deepEqual(summary.orms, ["gorm"]);
    assert.deepEqual(summary.tests, ["testify"]);
    assert.deepEqual(summary.buildSystems, ["make"]);
    assert.deepEqual(profile.layout.sourceDirectories, ["cmd", "internal"]);
  });
});

test("a Rust workspace is profiled from Cargo.toml", async () => {
  await withRepo(RUST_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.deepEqual(summary.languages, ["rust"]);
    assert.deepEqual(summary.frameworks, ["axum"]);
    assert.equal(summary.packageManager, "cargo");
    assert.deepEqual(summary.databases, ["sqlite"]);
    assert.equal(summary.monorepo, true);
    assert.deepEqual(profile.monorepo.evidence, ["Cargo.toml [workspace]"]);
  });
});

test("a Java project is profiled from pom.xml artifact ids", async () => {
  await withRepo(JAVA_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.deepEqual(summary.languages, ["java"]);
    assert.deepEqual(summary.frameworks, ["spring-boot"]);
    assert.equal(summary.packageManager, "maven");
    assert.deepEqual(summary.orms, ["hibernate"]);
    assert.deepEqual(summary.ci, ["jenkins"]);
    assert.deepEqual(names(profile.buildSystems), ["maven"]);
  });
});

test("an unknown repository still produces a profile instead of failing", async () => {
  await withRepo(PLAIN_REPO, (profile) => {
    const summary = summarizeProfile(profile);
    assert.deepEqual(summary.languages, []);
    assert.deepEqual(summary.frameworks, []);
    assert.equal(summary.packageManager, null);
    assert.deepEqual(profile.manifests, []);
    assert.equal(profile.git.isGitRepo, false);
    assert.equal(profile.truncated, false);
    assert.equal(profile.layout.hasReadme, false);
  });
});

test("scanning is bounded, deterministic, and reports what it skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "weave-recon-"));
  try {
    await writeRepo(dir, {
      "a.ts": "1",
      "b.ts": "2",
      "c.ts": "3",
      "node_modules/pkg/index.js": "ignored",
      "deep/one/two/three/four.ts": "4",
    });
    const limited = await profileRepository(dir, { maxFiles: 2, maxDepth: 2 });
    assert.equal(limited.truncated, true);
    assert.ok(limited.skipped.some((entry) => entry.reason.startsWith("more than 2 files")));

    const shallow = await profileRepository(dir, { maxDepth: 2 });
    assert.ok(shallow.skipped.some((entry) => entry.reason === "deeper than 2 levels"));

    const first = await profileRepository(dir);
    assert.ok(first.skipped.some((entry) => entry.path === "node_modules" && entry.reason === "ignored directory"));
    const second = await profileRepository(dir);
    assert.deepEqual(first, second);
    assert.equal(first.truncated, false);
    assert.equal(first.languages[0]?.fileCount, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
