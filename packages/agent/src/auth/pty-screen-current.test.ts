import test from "node:test";
import assert from "node:assert/strict";
import { currentScreen, toScreenLines } from "./pty-screen.ts";

test("keeps only what was painted after the last clear", () => {
  const raw = "old page\x1b[2Jnew page";
  assert.equal(currentScreen(raw), "new page");
});

test("uses the last clear when several pages were painted", () => {
  const raw = "page one\x1b[2Jpage two\x1b[2Jpage three";
  assert.equal(currentScreen(raw), "page three");
});

test("leaves output with no clear untouched", () => {
  assert.equal(currentScreen("just output"), "just output");
});

test("a wizard's earlier pages do not survive into the screen", () => {
  const raw = "Choose your color scheme:\r\n> terminal\x1b[2JTerms of Service & Data Use\r\n> [x] Yes, I agree";
  const lines = toScreenLines(currentScreen(raw));
  assert.ok(!lines.some((l) => l.includes("color scheme")), "theme page gone");
  assert.ok(lines.some((l) => l.includes("Terms of Service")), "consent page shown");
});
