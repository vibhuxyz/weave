import test from "node:test";
import assert from "node:assert/strict";
import { inspectCommandBoundaries } from "./command-safety.ts";

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
