import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensurePrivateDir, openDatabaseFile } from "./database.ts";
import { projectLocations, weaveLocations } from "./locations.ts";
import { projectDataDir } from "./project-data.ts";
import { MIGRATIONS } from "./schema.ts";
import { ProjectsRepo } from "./repos/index.ts";

const NOW_MS = Date.UTC(2026, 8, 23);
const PERMISSION_BITS = 0o777;

test("the database survives a reopen and migrations run once", async () => {
  const home = await mkdtemp(join(tmpdir(), "weave-home-"));
  const { databasePath } = weaveLocations(home);
  const first = openDatabaseFile(databasePath);
  const created = new ProjectsRepo(first).resolve("/work/a", NOW_MS);
  first.close();
  const second = openDatabaseFile(databasePath);
  assert.equal(new ProjectsRepo(second).findByRootPath("/work/a")?.id, created.id);
  assert.deepEqual({ ...second.prepare("PRAGMA user_version").get() }, { user_version: MIGRATIONS.length });
  second.close();
});

test("the home folder and database are private to the OS user", async () => {
  const home = join(await mkdtemp(join(tmpdir(), "weave-home-")), "nested");
  ensurePrivateDir(home);
  const { databasePath } = weaveLocations(home);
  openDatabaseFile(databasePath).close();
  assert.equal((await stat(home)).mode & PERMISSION_BITS, 0o700);
  assert.equal((await stat(databasePath)).mode & PERMISSION_BITS, 0o600);
});

test("locations keep weave data out of the project folder", () => {
  const weave = weaveLocations("/home/me/.weave");
  const locations = projectLocations(weave, { id: "p1", name: "a", rootPath: "/work/a" });
  assert.equal(locations.dataDir, "/home/me/.weave/projects/p1");
  assert.deepEqual(locations.skillDirs, [
    "/home/me/.weave/projects/p1/skills",
    "/work/a/.agents/skills",
    "/home/me/.weave/skills",
  ]);
  assert.deepEqual(locations.ruleDirs, ["/home/me/.weave/projects/p1/rules", "/work/a/.agents/rules", "/home/me/.weave/rules"]);
});

test("a relative home override is ignored", () => {
  assert.notEqual(weaveLocations("relative/dir").home, "relative/dir");
});

test("project data paths only resolve to real project ids inside the Weave home", () => {
  const good = "01a0ce95-7610-7ad0-a7e6-caa8e5341190";
  assert.deepEqual(projectDataDir("/home/me/.weave", good), { ok: true, value: `/home/me/.weave/projects/${good}` });
  for (const bad of ["..", "../../etc", "", "not-a-uuid", `${good}/../..`]) {
    assert.equal(projectDataDir("/home/me/.weave", bad).ok, false, bad);
  }
});
