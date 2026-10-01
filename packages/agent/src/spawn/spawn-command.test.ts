import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { ENGINES, dropUnsolicitedGrokResponses } from "../engines/index.ts";
import { resolveSpawnCommand } from "./spawn.ts";

test("a native engine runs its binary directly; a node engine runs through node", () => {
  const native = resolveSpawnCommand("/work", "/engines/opencode", ["acp"], { runtime: "native" });
  assert.deepEqual(native, { spawnBin: "/engines/opencode", spawnArgs: ["acp"] });
  const script = resolveSpawnCommand("/work", "/engines/gemini.js", ["--acp"], {});
  assert.deepEqual(script.spawnArgs, ["/engines/gemini.js", "--acp"]);
  assert.notEqual(script.spawnBin, "/engines/gemini.js");
});

test("Gemini CLI, OpenCode, and Grok are registered with their ACP entry points", () => {
  assert.deepEqual([ENGINES.gemini?.packageName, ENGINES.gemini?.binName, ENGINES.gemini?.args], ["@google/gemini-cli", "gemini", ["--acp"]]);
  assert.deepEqual([ENGINES.opencode?.packageName, ENGINES.opencode?.binName, ENGINES.opencode?.args, ENGINES.opencode?.runtime], ["opencode-ai", "opencode", ["acp"], "native"]);
  assert.deepEqual(
    [ENGINES.grok?.packageName, ENGINES.grok?.binName, ENGINES.grok?.args, ENGINES.grok?.runtime],
    ["@xai-official/grok", "grok", ["agent", "--no-leader", "stdio"], "native"],
  );
});

test("a grok skills-reload response is dropped and other ACP messages stay", async () => {
  const input = Readable.from([
    '{"jsonrpc":"2.0","id":1,"method":"session/update","params":{}}\n{"jsonrpc":"2.0","id":"skills-re',
    'load","result":{"ok":true}}\n{"jsonrpc":"2.0","id":2,"result":true}\n',
  ]);
  const output = Buffer.concat(await dropUnsolicitedGrokResponses(input).toArray()).toString("utf8");
  assert.equal(output.includes("skills-reload"), false);
  assert.match(output, /"id":1/);
  assert.match(output, /"id":2/);
});
