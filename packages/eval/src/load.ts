import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Fixture, RunConfig, VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS } from "@weave/protocol";

export interface FixtureFile {
  fixtures: Fixture[];
  configs: RunConfig[];
}

/**
 * Load a fixtures file, resolving every path relative to the file itself and
 * REFUSING anything that would produce an uncomparable number.
 *
 * Relative paths are the point: the fixture set is checked in and has to work
 * from any working directory, including an overnight cron.
 *
 * Validation is strict on purpose, and it throws rather than warning. A fixture
 * that is subtly wrong does not announce itself at 3am — it produces a plausible
 * number that gets pasted into a decision three weeks later. Failing the load is
 * the cheapest place to catch that.
 */
export async function loadFixtures(file: string): Promise<FixtureFile> {
  const path = resolve(file);
  const base = dirname(path);
  const parsed = JSON.parse(await readFile(path, "utf8")) as FixtureFile;

  const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));

  const fixtures = parsed.fixtures.map((fixture) => {
    validate(fixture, path);
    return {
      ...fixture,
      repo: fixture.repo ? abs(fixture.repo) : undefined,
      injectFiles: fixture.injectFiles
        ? Object.fromEntries(
            Object.entries(fixture.injectFiles).map(([target, source]) => [
              target,
              abs(source),
            ]),
          )
        : undefined,
    };
  });

  const seen = new Set<string>();
  for (const fixture of fixtures) {
    if (seen.has(fixture.id)) {
      throw new Error(`${path}: duplicate fixture id "${fixture.id}"`);
    }
    seen.add(fixture.id);
  }

  return { fixtures, configs: parsed.configs ?? [] };
}

const RUNGS = new Set<string>(VERIFICATION_RUNGS);

function validate(fixture: Fixture, file: string): void {
  const where = `${file}: fixture "${fixture.id ?? "(no id)"}"`;
  const kind = fixture.kind ?? "existing";

  if (!fixture.id) throw new Error(`${file}: a fixture has no id`);
  if (!fixture.prompt) throw new Error(`${where} has no prompt`);

  if (kind === "existing" && !fixture.repo) {
    throw new Error(`${where} is \`existing\` but has no repo`);
  }
  if (kind === "greenfield" && fixture.repo) {
    throw new Error(
      `${where} is \`greenfield\` but names a repo. Greenfield starts empty — ` +
        `if it needs starting files, use injectFiles.`,
    );
  }

  // The rule that keeps the rung honest. A `verify` command whose strength is
  // unknown cannot be compared with anything, and defaulting it to `tests`
  // would promote a `tsc --noEmit` one-liner to rung 8 and silently inflate
  // every comparison it appears in.
  if (fixture.verify && !fixture.verifyRung) {
    throw new Error(
      `${where} sets \`verify\` without \`verifyRung\`. Say which rung the ` +
        `command represents — there is no safe default.`,
    );
  }
  if (fixture.verifyRung && !RUNGS.has(fixture.verifyRung)) {
    throw new Error(
      `${where} has verifyRung "${fixture.verifyRung}". Known rungs: ${[...RUNGS].join(", ")}`,
    );
  }
  if (fixture.verifyRung && !fixture.verify) {
    throw new Error(
      `${where} sets \`verifyRung\` without \`verify\`. Drop it and let the ` +
        `ladder pick, or supply the command.`,
    );
  }
  if (
    fixture.expectRungAtLeast &&
    !RUNGS.has(fixture.expectRungAtLeast as VerificationRung)
  ) {
    throw new Error(
      `${where} has expectRungAtLeast "${fixture.expectRungAtLeast}". ` +
        `Known rungs: ${[...RUNGS].join(", ")}`,
    );
  }
  if (fixture.expectRungAtLeast && fixture.expectFail) {
    throw new Error(
      `${where} sets both \`expectRungAtLeast\` and \`expectFail\`. ` +
        `expectRungAtLeast replaces the expectFail precondition.`,
    );
  }
}
