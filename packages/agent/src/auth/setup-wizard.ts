import { parseConsentPage, type ParsedConsent } from "./consent-page.ts";
import type { TerminalKeyName } from "./terminal-keys.ts";

export type SetupPage =
  /** Cosmetic or informational — nothing here is the user's decision. */
  | { readonly kind: "auto"; readonly key: TerminalKeyName; readonly reason: string }
  /** Asks the user to agree to something. Never answered on their behalf. */
  | { readonly kind: "consent"; readonly parsed: ParsedConsent }
  | { readonly kind: "unknown" };

/** Page markers, matched against the wizard's rendered screen. */
const CONSENT_MARKERS = [
  "i agree",
  "privacy policy",
  "terms of service",
  "collect and use my",
];

const AUTO_PAGES: readonly { readonly marker: string; readonly key: TerminalKeyName; readonly reason: string }[] = [
  { marker: "choose your color scheme", key: "enter", reason: "colour scheme" },
  { marker: "welcome to antigravity cli", key: "enter", reason: "welcome" },
];

/**
 * What the wizard is showing, and whether Weave may answer it.
 *
 * Consent is checked first and wins: a page that asks the user to agree to
 * something is theirs to answer even when it also looks skippable.
 */
export function classifySetupPage(lines: readonly string[]): SetupPage {
  const screen = lines.join("\n").toLowerCase();
  if (CONSENT_MARKERS.some((marker) => screen.includes(marker))) {
    return { kind: "consent", parsed: parseConsentPage(lines) };
  }
  const auto = AUTO_PAGES.find((page) => screen.includes(page.marker));
  return auto ? { kind: "auto", key: auto.key, reason: auto.reason } : { kind: "unknown" };
}
