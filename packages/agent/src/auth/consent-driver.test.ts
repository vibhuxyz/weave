import test from "node:test";
import assert from "node:assert/strict";
import { beginConsentDrive, nextConsentAction, type ConsentDrive } from "./consent-driver.ts";
import { parseConsentPage } from "./consent-page.ts";
import { CONSENT_CHECKBOX, CONSENT_DONE, CONSENT_PREVIOUS } from "./consent-page.test.ts";

const untick = (lines: readonly string[]) => lines.map((l) => l.replace("[x]", "[ ]"));

function step(drive: ConsentDrive, lines: readonly string[]) {
  const screen = lines.join("\n");
  return nextConsentAction(drive, parseConsentPage(lines), screen);
}

test("agreeing walks checkbox -> Previous -> Done, then confirms", () => {
  let drive = beginConsentDrive(true);
  const first = step(drive, CONSENT_CHECKBOX);
  assert.deepEqual(first.action, { kind: "send", key: "down", intent: "navigate" });
  drive = first.drive;

  const second = step(drive, CONSENT_PREVIOUS);
  assert.deepEqual(second.action, { kind: "send", key: "right", intent: "navigate" });
  drive = second.drive;

  const third = step(drive, CONSENT_DONE);
  assert.deepEqual(third.action, { kind: "send", key: "enter", intent: "confirm" });
  assert.equal(third.drive.confirmed, true);
});

test("declining unticks the box first, and only then walks to Done", () => {
  let drive = beginConsentDrive(false);
  const toggle = step(drive, CONSENT_CHECKBOX);
  assert.deepEqual(toggle.action, { kind: "send", key: "enter", intent: "toggle" });
  drive = toggle.drive;

  const walk = step(drive, untick(CONSENT_CHECKBOX));
  assert.deepEqual(walk.action, { kind: "send", key: "down", intent: "navigate" });
});

test("SAFETY: never confirms while the checkbox disagrees with the user", () => {
  // Focus is already on Done, but the box still reads [x] and the user said no.
  const { action } = step(beginConsentDrive(false), CONSENT_DONE);
  assert.notEqual(action.kind === "send" && action.intent, "confirm");
  assert.deepEqual(action, { kind: "send", key: "left", intent: "navigate" });
});

test("SAFETY: never confirms while the footer still says Enter toggles", () => {
  const stillToggling = [
    ...CONSENT_DONE.slice(0, -1),
    "↑/↓ Navigate · > Done Toggle",
  ];
  const { action } = step(beginConsentDrive(true), stillToggling);
  assert.equal(action.kind, "handover");
});

test("SAFETY: never acts when it cannot tell what is focused", () => {
  const ambiguous = [...CONSENT_CHECKBOX.slice(0, -1), "> Previous Confirm > Done Confirm"];
  const parsed = parseConsentPage(ambiguous);
  assert.equal(parsed.kind, "parsed");
  // Both markers present: the last one wins, so focus is decidable here.
  // The genuinely ambiguous case is an unreadable screen.
  const { action } = step(beginConsentDrive(true), ["total gibberish"]);
  assert.equal(action.kind, "handover");
});

test("sends nothing more once it has confirmed", () => {
  let drive = beginConsentDrive(true);
  drive = step(drive, CONSENT_CHECKBOX).drive;
  drive = step(drive, CONSENT_PREVIOUS).drive;
  drive = step(drive, CONSENT_DONE).drive;
  assert.equal(drive.confirmed, true);
  for (const lines of [CONSENT_DONE, CONSENT_CHECKBOX, CONSENT_PREVIOUS]) {
    const after = step(drive, lines);
    assert.deepEqual(after.action, { kind: "wait" });
    drive = after.drive;
  }
});

test("a keypress that changes nothing eventually hands over", () => {
  let drive = beginConsentDrive(true);
  drive = step(drive, CONSENT_CHECKBOX).drive;
  let last = step(drive, CONSENT_CHECKBOX);
  for (let i = 0; i < 8 && last.action.kind === "wait"; i += 1) {
    last = step(last.drive, CONSENT_CHECKBOX);
  }
  assert.equal(last.action.kind, "handover");
});

test("an unparseable screen hands over rather than guessing", () => {
  const { action } = step(beginConsentDrive(true), ["Choose your color scheme:", "[Next]"]);
  assert.equal(action.kind, "handover");
});

test("handover is sticky", () => {
  const bailed = step(beginConsentDrive(true), ["nonsense"]).drive;
  assert.equal(bailed.handedOver, true);
  assert.equal(step(bailed, CONSENT_DONE).action.kind, "handover");
});

test("the key budget is bounded", () => {
  let drive = beginConsentDrive(true);
  // Alternate screens so the stale guard never fires and only the key cap can stop it.
  for (let i = 0; i < 40; i += 1) {
    const lines = i % 2 === 0 ? CONSENT_CHECKBOX : CONSENT_PREVIOUS;
    const next = step(drive, [...lines, `tick ${i}`]);
    drive = next.drive;
    if (next.action.kind === "handover") break;
  }
  assert.equal(drive.handedOver, true);
  assert.ok(drive.keysSent <= 12, `keysSent=${drive.keysSent}`);
});

test("PROPERTY: a confirm implies box matches, focus is Done, Enter is not toggle", () => {
  const screens = [CONSENT_CHECKBOX, CONSENT_PREVIOUS, CONSENT_DONE];
  for (const agreed of [true, false]) {
    for (const base of screens) {
      for (const lines of [base, untick(base)]) {
        const { action } = step(beginConsentDrive(agreed), lines);
        if (action.kind !== "send" || action.intent !== "confirm") continue;
        const parsed = parseConsentPage(lines);
        assert.equal(parsed.kind, "parsed");
        if (parsed.kind !== "parsed") continue;
        assert.equal(parsed.page.checked, agreed);
        assert.equal(parsed.page.focus, "done");
        assert.notEqual(parsed.page.enterAction, "toggle");
      }
    }
  }
});
