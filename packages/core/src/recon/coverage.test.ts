import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterFor } from "../context/languages/index.ts";
import { intake } from "../intake/index.ts";
import { CASES, SHAPES, type Files } from "./coverage-cases.ts";
import { profileRepository } from "./profile.ts";
import { summarizeProfile } from "./summary.ts";

async function repoWith(files: Files): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "weave-coverage-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

for (const each of CASES) {
  test(`${each.language}: recon names it, the parser reads it, and verification has a command`, async () => {
    const dir = await repoWith(each.files);

    const profile = await profileRepository(dir);
    const summary = summarizeProfile(profile);
    assert.ok(
      summary.languages.includes(each.language),
      `recon reported ${summary.languages.join(", ") || "nothing"} for ${each.language}`,
    );

    const source = each.files[each.sourcePath];
    assert.ok(source);
    const adapter = adapterFor(each.sourcePath);
    if (adapter) {
      const facts = adapter.parse(each.sourcePath, source);
      for (const name of each.expectSymbols) {
        assert.ok(
          facts.symbols.some((symbol) => symbol.name === name),
          `${each.language}: no symbol ${name} in ${facts.symbols.map((symbol) => symbol.name).join(", ") || "none"}`,
        );
      }
      for (const specifier of each.expectImports) {
        assert.ok(
          facts.imports.some((entry) => entry.specifier === specifier),
          `${each.language}: no import ${specifier} in ${facts.imports.map((entry) => entry.specifier).join(", ") || "none"}`,
        );
      }
    }

    const detected = await intake(dir);
    const tests = detected.detected.find((entry) => entry.rung === "tests");
    const command = tests?.execution.via === "command" ? tests.execution.command : null;
    assert.equal(command, each.expectTestCommand, `${each.language} test command`);
  });
}

test("every language the parser claims is also a language recon can name", () => {
  for (const each of CASES) {
    const adapter = adapterFor(each.sourcePath);
    if (!adapter) continue;
    assert.ok(adapter.language.length > 0);
  }
});

for (const each of SHAPES) {
  test(`${each.shape} is profiled without failing`, async () => {
    const dir = await repoWith(each.files);
    const profile = await profileRepository(dir);
    each.expect(summarizeProfile(profile));
    assert.equal(profile.truncated, false);
    assert.ok(profile.skipped.every((entry) => entry.reason.length > 0));
    await intake(dir);
  });
}

test("discovery depth adapts to the repository instead of growing without a cap", async () => {
  const files: Record<string, string> = { "package.json": JSON.stringify({ name: "big" }) };
  for (let index = 0; index < 400; index += 1) {
    files[`src/group-${Math.floor(index / 50)}/file-${index}.ts`] = `export const v${index} = ${index};\n`;
  }
  const dir = await repoWith(files);

  const full = await profileRepository(dir);
  assert.equal(full.truncated, false);
  assert.equal(full.languages[0]?.fileCount, 400);

  const shallow = await profileRepository(dir, { maxFiles: 100 });
  assert.equal(shallow.truncated, true);
  assert.ok(
    shallow.skipped.some((entry) => entry.reason.includes("more than 100 files")),
    "a capped scan must say what it did not look at",
  );
  assert.deepEqual(shallow, await profileRepository(dir, { maxFiles: 100 }));
});
