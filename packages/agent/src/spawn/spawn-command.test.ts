import test from "node:test";
import assert from "node:assert/strict";
import { ENGINES } from "../engines/index.ts";
import { resolveSpawnCommand } from "./spawn.ts";

test("a native engine runs its binary directly; a node engine runs through node", () => {
  const native = resolveSpawnCommand("/work", "/engines/opencode", ["acp"], { runtime: "native" });
  assert.deepEqual(native, { spawnBin: "/engines/opencode", spawnArgs: ["acp"] });
  const script = resolveSpawnCommand("/work", "/engines/gemini.js", ["--acp"], {});
  assert.deepEqual(script.spawnArgs, ["/engines/gemini.js", "--acp"]);
  assert.notEqual(script.spawnBin, "/engines/gemini.js");
});

test("Gemini CLI and OpenCode are registered with their ACP entry points", () => {
  assert.deepEqual([ENGINES.gemini?.packageName, ENGINES.gemini?.binName, ENGINES.gemini?.args], ["@google/gemini-cli", "gemini", ["--acp"]]);
  assert.deepEqual([ENGINES.opencode?.packageName, ENGINES.opencode?.binName, ENGINES.opencode?.args, ENGINES.opencode?.runtime], ["opencode-ai", "opencode", ["acp"], "native"]);
});
