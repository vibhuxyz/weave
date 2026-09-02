import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Fixture, RunConfig } from "@berd/protocol";

export interface FixtureFile {
  fixtures: Fixture[];
  configs: RunConfig[];
}

/**
 * Load a fixtures file, resolving every path relative to the file itself.
 *
 * Relative paths are the point: the fixture set is checked in and has to work
 * from any working directory, including an overnight cron.
 */
export async function loadFixtures(file: string): Promise<FixtureFile> {
  const path = resolve(file);
  const base = dirname(path);
  const parsed = JSON.parse(await readFile(path, "utf8")) as FixtureFile;

  const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));

  const fixtures = parsed.fixtures.map((fixture) => ({
    ...fixture,
    repo: abs(fixture.repo),
    injectFiles: fixture.injectFiles
      ? Object.fromEntries(
          Object.entries(fixture.injectFiles).map(([target, source]) => [
            target,
            abs(source),
          ]),
        )
      : undefined,
  }));

  return { fixtures, configs: parsed.configs ?? [] };
}
