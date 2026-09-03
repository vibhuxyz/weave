/**
 * Harness-owned acceptance check for a GREENFIELD scaffold (ladder rung 4:
 * build). Not a test file the project runs itself — this drives the CLI as
 * a user would and inspects its output, the same way the greenfield SMOKE
 * fixture drives an HTTP server instead of unit-testing its handlers.
 *
 * Injected before the run so the acceptance bar is fixed at plan time, and
 * restored from pristine before verify, per `readOnlyPaths`.
 */
import { spawn } from "node:child_process";

function run(args, input) {
  return new Promise((done) => {
    const child = spawn("node", ["src/cli.js", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("close", (code) => done({ code, out, err }));
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

function fail(message, extra = "") {
  console.error(`CHECK FAIL: ${message}`);
  if (extra) console.error(extra.slice(-2000));
  process.exit(1);
}

const a = await run(["--top", "2"], "the cat the dog the bird cat\n");
if (a.code !== 0) fail(`exit code ${a.code} on stdin input`, a.err);

let parsed;
try {
  parsed = JSON.parse(a.out);
} catch {
  fail("stdout was not valid JSON", a.out);
}

if (!Array.isArray(parsed) || parsed.length !== 2) {
  fail(`expected 2 ranked words, got ${JSON.stringify(parsed)}`);
}
if (parsed[0].word !== "the" || parsed[0].count !== 3) {
  fail(`expected the most frequent word first with count 3, got ${JSON.stringify(parsed[0])}`);
}
if (parsed[1].word !== "cat" || parsed[1].count !== 2) {
  fail(`expected the second word to be "cat" with count 2, got ${JSON.stringify(parsed[1])}`);
}

const b = await run(["--top", "1"], "");
if (b.code !== 0) fail(`exit code ${b.code} on empty input`, b.err);
let parsedEmpty;
try {
  parsedEmpty = JSON.parse(b.out);
} catch {
  fail("stdout was not valid JSON for empty input", b.out);
}
if (!Array.isArray(parsedEmpty) || parsedEmpty.length !== 0) {
  fail(`expected an empty array for empty input, got ${JSON.stringify(parsedEmpty)}`);
}

console.log("CHECK PASS: word counts ranked correctly, empty input handled");
