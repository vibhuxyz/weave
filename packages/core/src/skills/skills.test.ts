import test from "node:test";
import assert from "node:assert/strict";
import { buildSkillRegistry } from "./registry.ts";
import { renderSkills } from "./render.ts";
import { resolveSkills } from "./resolve.ts";
import type { SkillQuery } from "./types.ts";

const BACKEND_PROJECT = { languages: ["TypeScript"], frameworks: ["Express", "PostgreSQL"], packages: ["express", "pg"] } as const;

function names(query: SkillQuery): readonly string[] {
  return resolveSkills(buildSkillRegistry([]).skills, query).map((resolved) => resolved.skill.name);
}

test("a backend task gets the TypeScript, Node, API and Postgres skills, not every skill", () => {
  const picked = names({ ...BACKEND_PROJECT, text: "Add an endpoint that lists seller payouts", paths: ["apps/api/src/payouts/payout.routes.ts"], layers: ["api", "service"] });
  assert.deepEqual([...picked].sort(), ["api-conventions", "backend", "node", "postgres", "typescript"]);
  assert.ok(!picked.includes("frontend"));
});

test("a UI task in a React app gets the frontend skill and leaves the database out", () => {
  const picked = names({ languages: ["TypeScript"], frameworks: ["React", "Vite"], packages: ["react"], text: "Make the payout button disabled while saving", paths: ["apps/web/src/components/PayoutButton.tsx"], layers: ["ui"] });
  assert.ok(picked.includes("frontend"));
  assert.ok(!picked.includes("postgres") && !picked.includes("database"));
});

test("a project skill overrides the built-in of the same name and matches by path", () => {
  const registry = buildSkillRegistry([{ name: "backend", description: "Our backend house rules", sourcePath: ".weave/skills/backend/SKILL.md", appliesTo: ["apps/api/**"] }]);
  assert.deepEqual(registry.overridden, ["backend"]);
  const resolved = resolveSkills(registry.skills, { languages: [], frameworks: [], packages: [], text: "tweak it", paths: ["apps/api/src/x.ts"], layers: [] });
  assert.deepEqual(resolved.map((entry) => entry.skill.id), ["project:backend"]);
  const block = renderSkills(resolved);
  assert.match(block, /Read the full skill at \.weave\/skills\/backend\/SKILL\.md/);
});

test("the skills block keeps its byte budget", () => {
  const resolved = resolveSkills(buildSkillRegistry([]).skills, { ...BACKEND_PROJECT, text: "endpoint", paths: [], layers: ["api"] });
  const block = renderSkills(resolved, 300);
  assert.ok(Buffer.byteLength(block, "utf8") < 500);
  assert.match(block, /more skills left out/);
});
