import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectCommandBoundaries } from "./command-safety.ts";
import { isUserSkillPath } from "./path-confinement.ts";

const SPACED_CWD = "/Users/tester/Documents/full stack";

test("a quoted or escaped task directory with a space is inside the task", () => {
  const commands = [
    `cd "${SPACED_CWD}/src/api" && npm install 2>&1 | tail -40`,
    `grep -rn "ts\\"" '${SPACED_CWD}/src/api/src'`,
    `cd ${SPACED_CWD.replace(" ", "\\ ")} && ls`,
    `find "${SPACED_CWD}" -maxdepth 2 -not -path './node_modules*'`,
  ];
  for (const command of commands) {
    assert.equal(inspectCommandBoundaries(command, SPACED_CWD).allowed, true, command);
  }
});

test("a sibling that shares the task directory's prefix is still outside", () => {
  const sibling = inspectCommandBoundaries(`cat "${SPACED_CWD}"-secrets/key`, SPACED_CWD);
  assert.equal(sibling.allowed, false);
  assert.match(sibling.reason ?? "", /targets \/Users\/tester\/Documents\/full stack-secrets\/key, outside task cwd/);

  const truncated = inspectCommandBoundaries("ls /Users/tester/Documents/full", SPACED_CWD);
  assert.equal(truncated.allowed, false);
});

test("a path hidden later in a quoted script is checked on its own", () => {
  const nested = inspectCommandBoundaries(`sh -c "cat ${SPACED_CWD}/a /Users/tester/.env"`, SPACED_CWD);
  assert.equal(nested.allowed, false);
  assert.match(nested.reason ?? "", /targets \/Users\/tester\/\.env/);
});

test("a spaced path that climbs back into the task directory is refused", () => {
  const climbing = inspectCommandBoundaries(`sh -c "cat /Users/tester/Documents/other x/../full stack/a"`, SPACED_CWD);
  assert.equal(climbing.allowed, false);
});

test("a command substitution inside double quotes keeps its quoted path whole", () => {
  const command = `echo "count: $(find "${SPACED_CWD}/node_modules/better-sqlite3" -name '*.node' | wc -l)"`;
  assert.equal(inspectCommandBoundaries(command, SPACED_CWD).allowed, true);
});

function projectWithPackages(): string {
  const root = mkdtempSync(join(tmpdir(), "weave-cd-"));
  mkdirSync(join(root, "src", "api"), { recursive: true });
  mkdirSync(join(root, "src", "ui"), { recursive: true });
  return root;
}

test("a parent path that stays inside the task after a cd is allowed", () => {
  const root = projectWithPackages();
  const command = `cd "${root}/src/api" && npm run typecheck 2>&1 | tail -30; cd ../ui && npm run typecheck 2>&1 | tail -30`;
  assert.equal(inspectCommandBoundaries(command, root).allowed, true);
  assert.equal(inspectCommandBoundaries("cd src/api && cd ../ui && ls", root).allowed, true);
});

test("a parent path is refused when the cd before it might not have happened", () => {
  const root = projectWithPackages();
  const commands = [
    `cd "${root}/src/missing"; cd ../ui`,
    "false && cd src/api; cat ../secret",
    "cd src/api || true; cat ../../secret",
    "cat ../secret",
  ];
  for (const command of commands) {
    const check = inspectCommandBoundaries(command, root);
    assert.equal(check.allowed, false, command);
    assert.match(check.reason ?? "", /traversal/);
  }
});

test("skill files under the home skill roots are readable and neighboring secrets are not", () => {
  const home = mkdtempSync(join(tmpdir(), "weave-home-"));
  const skill = join(home, ".agents", "skills", "mentor", "SKILL.md");
  const bundled = join(home, ".grok", "bundled", "skills", "docx", "SKILL.md");
  const secret = join(home, ".ssh", "id_rsa");
  mkdirSync(join(home, ".agents", "skills", "mentor"), { recursive: true });
  mkdirSync(join(home, ".grok", "bundled", "skills", "docx"), { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  writeFileSync(secret, "secret");
  symlinkSync(secret, join(home, ".agents", "skills", "mentor", "linked-secret"));

  assert.equal(isUserSkillPath(skill, home), true);
  assert.equal(isUserSkillPath(bundled, home), true);
  assert.equal(isUserSkillPath(secret, home), false);
  assert.equal(isUserSkillPath(join(home, ".grok", "auth.json"), home), false);
  assert.equal(isUserSkillPath(join(home, ".agents", "skills-evil", "SKILL.md"), home), false);
  assert.equal(isUserSkillPath(join(home, ".agents", "skills", "mentor", "linked-secret"), home), false);
});

test("a parent path through a symlinked directory is judged where it really lands", () => {
  const root = projectWithPackages();
  const outside = mkdtempSync(join(tmpdir(), "weave-outside-"));
  mkdirSync(join(outside, "deep"));
  symlinkSync(join(outside, "deep"), join(root, "link"));
  assert.equal(inspectCommandBoundaries("cd link && cat ../secret", root).allowed, false);
});
