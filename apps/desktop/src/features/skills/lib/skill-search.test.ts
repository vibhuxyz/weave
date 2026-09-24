import test from "node:test";
import assert from "node:assert/strict";
import type { SkillView } from "../types";
import { filterSkills, triggerGroupsOf } from "./skill-search";

function skill(name: string, overrides: Partial<SkillView> = {}): SkillView {
  return { id: `builtin:${name}`, name, description: "", source: "builtin", sourcePath: null, replacesBuiltin: false, triggers: {}, usedBy: [], ...overrides };
}

const SKILLS = [
  skill("postgres", { triggers: { refines: "database", packages: ["pg"], layers: ["data"] }, usedBy: [{ id: "database-engineer", name: "Database Engineer" }] }),
  skill("frontend", { description: "UI work", triggers: { frameworks: ["React"] } }),
];

test("trigger groups keep a fixed order, skip empty kinds and add what a skill refines", () => {
  assert.deepEqual(triggerGroupsOf(SKILLS[0]?.triggers ?? {}), [
    { label: "Packages", values: ["pg"] },
    { label: "Layers", values: ["data"] },
    { label: "Refines", values: ["database"] },
  ]);
});

test("search matches names, descriptions, triggers and employees, and every word must match", () => {
  assert.deepEqual(filterSkills(SKILLS, "  ").map((item) => item.name), ["postgres", "frontend"]);
  assert.deepEqual(filterSkills(SKILLS, "react").map((item) => item.name), ["frontend"]);
  assert.deepEqual(filterSkills(SKILLS, "Database engineer").map((item) => item.name), ["postgres"]);
  assert.deepEqual(filterSkills(SKILLS, "pg ui").map((item) => item.name), []);
});
