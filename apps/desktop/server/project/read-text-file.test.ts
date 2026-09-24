import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_TEXT_FILE_BYTES, readTextFile } from "./read-text-file.ts";

async function project(): Promise<{ readonly root: string; readonly outside: string }> {
  const base = await mkdtemp(join(tmpdir(), "weave-read-"));
  const root = join(base, "project");
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "a.md"), "# hello\n");
  await writeFile(join(root, "blob.bin"), Buffer.from([1, 0, 2]));
  await writeFile(join(base, "secret.txt"), "nope");
  await symlink(join(base, "secret.txt"), join(root, "link.txt"));
  return { root, outside: join(base, "secret.txt") };
}

test("a text file inside the project is read", async () => {
  const { root } = await project();
  assert.deepEqual(await readTextFile(root, "docs/a.md"), { ok: true, content: "# hello\n", truncated: false });
});

test("escapes, symlinks out, binaries and missing files are refused with a reason", async () => {
  const { root, outside } = await project();
  for (const path of ["../secret.txt", outside, "link.txt"]) {
    const result = await readTextFile(root, path);
    assert.equal(result.ok, false, path);
    assert.match(result.ok ? "" : result.reason, /outside the project/);
  }
  assert.deepEqual(await readTextFile(root, "blob.bin"), { ok: false, reason: "Cannot open blob.bin: it is a binary file." });
  assert.deepEqual(await readTextFile(root, "docs"), { ok: false, reason: "Cannot open docs: no such file in this project." });
  assert.deepEqual(await readTextFile(root, "gone.md"), { ok: false, reason: "Cannot open gone.md: no such file in this project." });
});

test("a file over the size cap is cut and marked truncated", async () => {
  const { root } = await project();
  await writeFile(join(root, "big.txt"), "x".repeat(MAX_TEXT_FILE_BYTES + 10));
  const result = await readTextFile(root, "big.txt");
  assert.equal(result.ok && result.truncated, true);
  assert.equal(result.ok ? result.content.length : 0, MAX_TEXT_FILE_BYTES);
});
