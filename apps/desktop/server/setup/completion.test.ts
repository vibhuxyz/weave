import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getEngine } from "@weave/agent";
import { awaitSetupCompletion, setupMarkerPath } from "./completion.ts";

const ANTIGRAVITY = getEngine("antigravity");
const MARKER = ".gemini/antigravity-cli/settings.json";
const LONGER_THAN_ONE_POLL_MS = 900;

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "weave-setup-"));
}

function writeMarker(home: string): void {
  const marker = join(home, MARKER);
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, "{}");
}

function settledWithin<T>(work: Promise<T>, ms: number): Promise<T | "still waiting"> {
  return Promise.race([
    work,
    new Promise<"still waiting">((done) => {
      const timer = setTimeout(() => done("still waiting"), ms);
      timer.unref?.();
    }),
  ]);
}

test("the marker path is reported for a wizard that has one", () => {
  assert.equal(setupMarkerPath(ANTIGRAVITY), `$HOME/${MARKER}`);
});

test("a wizard whose marker never appears keeps waiting", async () => {
  const abort = new AbortController();
  const waiting = awaitSetupCompletion({ engine: ANTIGRAVITY, signal: abort.signal, home: freshHome() });
  assert.equal(await settledWithin(waiting, LONGER_THAN_ONE_POLL_MS), "still waiting");
  abort.abort();
});

test("a marker written while the wizard runs completes the setup", async () => {
  const home = freshHome();
  const waiting = awaitSetupCompletion({ engine: ANTIGRAVITY, signal: new AbortController().signal, home });
  writeMarker(home);
  assert.equal(await waiting, true);
});

test("cancelling the setup stops the watch instead of leaving it running", async () => {
  const abort = new AbortController();
  const waiting = awaitSetupCompletion({ engine: ANTIGRAVITY, signal: abort.signal, home: freshHome() });
  abort.abort();
  assert.equal(await waiting, false);
});

test("a setup cancelled before the watch starts resolves at once", async () => {
  const abort = new AbortController();
  abort.abort();
  assert.equal(await awaitSetupCompletion({ engine: ANTIGRAVITY, signal: abort.signal }), false);
});
