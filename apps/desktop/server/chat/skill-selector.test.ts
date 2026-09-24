import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marketplaceRepo } from "@weave/core/context/testing.ts";
import { createSkillSelector } from "./skill-selector.ts";

test("chat prompts get the skills their request needs instead of every built-in skill", async () => {
  const root = await marketplaceRepo();
  const select = createSkillSelector(root, await mkdtemp(join(tmpdir(), "weave-skills-")));
  const backend = await select("Add an endpoint that lists seller payouts");
  assert.match(backend, /## backend/);
  assert.match(backend, /## api-conventions/);
  assert.doesNotMatch(backend, /## frontend/);
  const ui = await select("Make the orders page component show a spinner");
  assert.match(ui, /## frontend/);
  assert.doesNotMatch(ui, /## postgres/);
});
