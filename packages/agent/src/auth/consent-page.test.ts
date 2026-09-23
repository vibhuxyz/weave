import test from "node:test";
import assert from "node:assert/strict";
import { parseConsentPage } from "./consent-page.ts";

/** Captured from the live wizard with focus on the checkbox. */
export const CONSENT_CHECKBOX = [
  "Terms of Service & Data Use",
  "AI coding agents are known to have certain security risks, including autonomous code execution, data exfiltration, prompt injection and supply chain risks.",
  "--------------------------------------------------------------------------------",
  "> [x] Yes, I agree to help improve Antigravity CLI by allowing",
  "Google to collect and use my Interactions data,",
  "subject to the Google Antigravity CLI Terms of Service",
  "Links:",
  "- Terms of Service: https://antigravity.google/terms",
  "- Privacy Policy: https://policies.google.com/privacy",
  "[Previous] [Done]",
  "↑/↓ Navigate · enter Toggle",
];

/** Same page after `down` — the footer repaints without clearing. */
export const CONSENT_PREVIOUS = [
  ...CONSENT_CHECKBOX.slice(0, -1),
  "↑/↓ Navigate · enter Toggle > Previous Confirm",
];

/** Same page after `down` then `right`. */
export const CONSENT_DONE = [
  ...CONSENT_CHECKBOX.slice(0, -1),
  "↑/↓ Navigate · enter Toggle > Previous Confirm [Previous] > Done Confirm",
];

function page(lines: readonly string[]) {
  const parsed = parseConsentPage(lines);
  assert.equal(parsed.kind, "parsed");
  if (parsed.kind !== "parsed") throw new Error("unreachable");
  return parsed.page;
}

test("reads a ticked box and both links", () => {
  const result = page(CONSENT_CHECKBOX);
  assert.equal(result.checked, true);
  assert.deepEqual(result.links.map((l) => l.label), ["Terms of Service", "Privacy Policy"]);
  assert.equal(result.links[0]?.url, "https://antigravity.google/terms");
});

test("reads an unticked box", () => {
  const unticked = CONSENT_CHECKBOX.map((l) => l.replace("[x]", "[ ]"));
  assert.equal(page(unticked).checked, false);
});

test("focus starts on the checkbox — its permanent > is not a focus marker", () => {
  assert.equal(page(CONSENT_CHECKBOX).focus, "checkbox");
});

test("focus follows the last marker as the footer repaints", () => {
  assert.equal(page(CONSENT_PREVIOUS).focus, "previous");
  assert.equal(page(CONSENT_DONE).focus, "done");
});

test("reads what Enter currently does", () => {
  assert.equal(page(CONSENT_CHECKBOX).enterAction, "toggle");
  assert.equal(page(CONSENT_DONE).enterAction, "confirm");
});

test("the agreement stops before the links", () => {
  const { agreement } = page(CONSENT_CHECKBOX);
  assert.ok(agreement.startsWith("Yes, I agree"));
  assert.ok(!agreement.includes("Links"));
  assert.ok(!agreement.includes("http"));
});

test("carries the title and the security notice", () => {
  const result = page(CONSENT_CHECKBOX);
  assert.equal(result.title, "Terms of Service & Data Use");
  assert.ok(result.notice?.startsWith("AI coding agents"));
});

test("a screen with no checkbox is unparseable, not guessed at", () => {
  const parsed = parseConsentPage(["Choose your color scheme:", "> terminal", "[Next]"]);
  assert.equal(parsed.kind, "unparseable");
});

test("two checkboxes are unparseable", () => {
  const parsed = parseConsentPage([...CONSENT_CHECKBOX, "> [ ] Another box entirely"]);
  assert.equal(parsed.kind, "unparseable");
});

test("a checkbox with no Done button is unparseable", () => {
  const parsed = parseConsentPage(["> [x] Yes, I agree to something", "[Next]"]);
  assert.equal(parsed.kind, "unparseable");
});

test("a non-http link is dropped while the rest survive", () => {
  const withBad = CONSENT_CHECKBOX.map((l) =>
    l.startsWith("- Terms") ? "- Terms of Service: javascript:alert(1)" : l,
  );
  assert.deepEqual(page(withBad).links.map((l) => l.label), ["Privacy Policy"]);
});

test("empty input is unparseable", () => {
  assert.equal(parseConsentPage([]).kind, "unparseable");
});
