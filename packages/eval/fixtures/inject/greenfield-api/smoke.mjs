/**
 * Harness-owned SMOKE test (ladder rung 7) for a greenfield HTTP service.
 *
 * Boots the project the way a user would — `npm start` — and drives a real
 * request flow against it. That is the difference between rung 5 and rung 7:
 * `boot` proves the process survives, `smoke` proves it actually answers.
 *
 * Injected before the run and restored before verify. The agent may read it,
 * which is the point: for a scaffold the acceptance criteria have to be known
 * at plan time.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const BOOT_TIMEOUT_MS = 20_000;
const POLL_MS = 250;

/** Ask the OS for a free port, then hand it back. Fixed ports collide. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

function fail(message, extra = "") {
  console.error(`SMOKE FAIL: ${message}`);
  if (extra) console.error(extra.slice(-2000));
  process.exit(1);
}

const port = await freePort();
const child = spawn("npm", ["start"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

let log = "";
child.stdout.on("data", (chunk) => (log += chunk));
child.stderr.on("data", (chunk) => (log += chunk));

let exited = null;
child.on("exit", (code) => (exited = code));

// SIGKILL the whole group: `npm start` spawns node as a child, and killing
// only npm leaves the server holding the port.
const stop = () => {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
};
process.on("exit", stop);

const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + BOOT_TIMEOUT_MS;

let health;
for (;;) {
  if (exited !== null) fail(`the server exited with code ${exited} before answering`, log);
  if (Date.now() > deadline) fail(`no response on ${base}/health within ${BOOT_TIMEOUT_MS}ms`, log);
  try {
    health = await fetch(`${base}/health`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (health.status !== 200) fail(`GET /health returned ${health.status}, expected 200`, log);

const healthBody = await health.json().catch(() => null);
if (!healthBody || healthBody.ok !== true) {
  fail(`GET /health body should be {"ok":true}, got ${JSON.stringify(healthBody)}`, log);
}

// ── the actual request flow ──────────────────────────────────────────────
const created = await fetch(`${base}/notes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "first", body: "hello" }),
});
if (created.status !== 201) fail(`POST /notes returned ${created.status}, expected 201`, log);

const note = await created.json().catch(() => null);
if (!note || typeof note.id === "undefined") {
  fail(`POST /notes should return the created note with an id, got ${JSON.stringify(note)}`, log);
}
if (note.title !== "first") fail(`POST /notes did not echo the title back`, log);

const listed = await fetch(`${base}/notes`);
if (listed.status !== 200) fail(`GET /notes returned ${listed.status}, expected 200`, log);

const notes = await listed.json().catch(() => null);
if (!Array.isArray(notes)) fail(`GET /notes should return an array, got ${JSON.stringify(notes)}`, log);
if (notes.length !== 1) fail(`GET /notes should list the 1 created note, got ${notes.length}`, log);
if (notes[0].id !== note.id) fail(`GET /notes returned a different note than POST created`, log);

const one = await fetch(`${base}/notes/${note.id}`);
if (one.status !== 200) fail(`GET /notes/${note.id} returned ${one.status}, expected 200`, log);

const missing = await fetch(`${base}/notes/does-not-exist`);
if (missing.status !== 404) {
  fail(`GET /notes/does-not-exist returned ${missing.status}, expected 404`, log);
}

console.log("SMOKE PASS: health, create, list, fetch, 404");
stop();
process.exit(0);
