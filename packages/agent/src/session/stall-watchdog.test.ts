import test from "node:test";
import assert from "node:assert/strict";
import { createStallWatchdog } from "./stall-watchdog.ts";

const TIMEOUT_MS = 40;
const stallError = () => new Error("stalled");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("rejects once the window passes with no activity", async () => {
  const watchdog = createStallWatchdog({ timeoutMs: TIMEOUT_MS, onStall: stallError });
  await assert.rejects(watchdog.arm(), /stalled/);
});

test("touch pushes the deadline out", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  const armed = watchdog.arm().catch(() => "rejected");

  for (let i = 0; i < 4; i += 1) {
    await sleep(TIMEOUT_MS / 2);
    watchdog.touch();
  }
  assert.equal(stalls, 0, "kept alive by activity");

  assert.equal(await armed, "rejected");
  assert.equal(stalls, 1, "fires once activity stops");
});

test("disarm stops it firing", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.disarm();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 0);
});

test("touch after disarm does not re-arm", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.disarm();
  watchdog.touch();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 0);
});

test("stalls only once", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  await assert.rejects(watchdog.arm(), /stalled/);
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 1);
});

test("a paused watchdog does not fire, however long the hold lasts", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.pause();
  await sleep(TIMEOUT_MS * 4);
  assert.equal(stalls, 0, "held while blocked on someone else");
  watchdog.resume();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 1, "countdown restarts once the hold is released");
});

test("nested holds only release on the last resume", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.pause();
  watchdog.pause();
  watchdog.resume();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 0, "one hold still outstanding");
  watchdog.resume();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 1);
});

test("touch while paused does not start the countdown", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.pause();
  watchdog.touch();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 0);
});

test("disarm clears outstanding holds", async () => {
  let stalls = 0;
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: () => { stalls += 1; return stallError(); },
  });
  void watchdog.arm().catch(() => {});
  watchdog.pause();
  watchdog.disarm();
  watchdog.resume();
  await sleep(TIMEOUT_MS * 3);
  assert.equal(stalls, 0, "a released hold must not revive a disarmed watchdog");
});

test("an armed override replaces the default window for that turn only", async () => {
  const seen: number[] = [];
  const watchdog = createStallWatchdog({
    timeoutMs: TIMEOUT_MS,
    onStall: (timeoutMs) => { seen.push(timeoutMs); return stallError(); },
  });
  const long = watchdog.arm(TIMEOUT_MS * 3).catch(() => "rejected");
  await sleep(TIMEOUT_MS + TIMEOUT_MS / 2);
  assert.deepEqual(seen, [], "still alive past the default window");
  assert.equal(await long, "rejected");
  assert.deepEqual(seen, [TIMEOUT_MS * 3]);

  watchdog.disarm();
  await assert.rejects(watchdog.arm(), /stalled/);
  assert.deepEqual(seen, [TIMEOUT_MS * 3, TIMEOUT_MS], "next turn is back on the default");
});
