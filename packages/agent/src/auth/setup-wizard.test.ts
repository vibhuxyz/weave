import test from "node:test";
import assert from "node:assert/strict";
import { classifySetupPage } from "./setup-wizard.ts";

const THEME_PAGE = [
  "Welcome to Antigravity CLI!",
  "Choose your color scheme:",
  "> terminal",
  "  light",
  "  solarized dark",
  "[Next]",
  "↑/↓ Navigate · enter Confirm",
];

const CONSENT_PAGE = [
  "AI coding agents are known to have certain security risks, including autonomous code execution,",
  "  > [x] Yes, I agree to help improve Antigravity CLI by allowing",
  "        Google to collect and use my Interactions data,",
  "  Links:",
  "  - Terms of Service: https://antigravity.google/terms",
  "  - Privacy Policy: https://policies.google.com/privacy",
  "[Previous]      [Done]",
];

test("the colour scheme page is answered by Weave", () => {
  const page = classifySetupPage(THEME_PAGE);
  assert.equal(page.kind, "auto");
  assert.equal(page.kind === "auto" && page.key, "enter");
});

test("the consent page is left to the user", () => {
  assert.equal(classifySetupPage(CONSENT_PAGE).kind, "consent");
});

test("consent wins over a skippable-looking page", () => {
  const mixed = [...THEME_PAGE, ...CONSENT_PAGE];
  assert.equal(classifySetupPage(mixed).kind, "consent");
});

test("an unrecognised page is shown rather than guessed at", () => {
  assert.equal(classifySetupPage(["Something new the wizard added"]).kind, "unknown");
});

test("an empty screen is not treated as answerable", () => {
  assert.equal(classifySetupPage([]).kind, "unknown");
});

test("matching ignores case and surrounding box drawing", () => {
  const boxed = ["│  CHOOSE YOUR COLOR SCHEME:  │"];
  assert.equal(classifySetupPage(boxed).kind, "auto");
});

test("the transcript of every page still reads as consent", () => {
  // The bug this guards: a repainting wizard whose pages pile up must not be
  // classified by an early page that has scrolled away.
  const piled = [
    "Welcome to Antigravity CLI!",
    "Choose your color scheme:",
    "Terms of Service & Data Use",
    "> [x] Yes, I agree to help improve Antigravity CLI",
    "[Previous] [Done]",
  ];
  assert.equal(classifySetupPage(piled).kind, "consent");
});
