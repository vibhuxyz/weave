import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMessage } from "../shared/index.ts";
import { sendSkillListing } from "./send-skills.ts";

async function listingFor(projectDir: string, skillDirs: readonly string[]) {
  const sent: ServerMessage[] = [];
  await sendSkillListing({ projectDir, skillDirs, send: (message) => sent.push(message) });
  const [listing] = sent;
  assert.ok(listing?.type === "skills", JSON.stringify(listing));
  return listing;
}

test("built-in skills list the employees that use them, sorted by name", async () => {
  const listing = await listingFor(await mkdtemp(join(tmpdir(), "weave-skills-")), []);
  const typescript = listing.skills.find((skill) => skill.name === "typescript");
  assert.equal(typescript?.source, "builtin");
  assert.deepEqual(typescript?.usedBy.map((employee) => employee.id), ["backend-engineer", "database-engineer", "frontend-engineer", "qa-engineer", "security-engineer"]);
  assert.deepEqual(listing.skills.map((skill) => skill.name), [...listing.skills.map((skill) => skill.name)].sort((a, b) => a.localeCompare(b)));
});

test("a project skill with a built-in's name replaces it, and skills no registry defines are reported", async () => {
  const project = await mkdtemp(join(tmpdir(), "weave-skills-"));
  const skillDir = join(project, "skills");
  await mkdir(join(skillDir, "testing"), { recursive: true });
  await writeFile(join(skillDir, "testing", "SKILL.md"), "---\nname: testing\ndescription: Our testing rules.\n---\nUse vitest.\n");
  await mkdir(join(project, ".weave", "employees"), { recursive: true });
  await writeFile(join(project, ".weave", "employees", "ml.json"), JSON.stringify({ id: "ml-engineer", name: "ML Engineer", skills: ["pytorch"] }));
  const listing = await listingFor(project, [skillDir]);
  const testing = listing.skills.filter((skill) => skill.name === "testing");
  assert.equal(testing.length, 1);
  assert.equal(testing[0]?.source, "project");
  assert.equal(testing[0]?.replacesBuiltin, true);
  assert.deepEqual(listing.unknownSkills, [{ name: "pytorch", usedBy: [{ id: "ml-engineer", name: "ML Engineer" }] }]);
});
