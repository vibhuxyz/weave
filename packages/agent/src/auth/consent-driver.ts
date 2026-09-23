import {
  MAX_CONSENT_KEYS,
  MAX_CONSENT_TOGGLES,
  MAX_STALE_SIGHTINGS,
} from "./consent-limits.ts";
import type { ConsentFocus, ParsedConsent } from "./consent-page.ts";
import type { TerminalKeyName } from "./terminal-keys.ts";

export type ConsentIntent = "toggle" | "navigate" | "confirm";

export type ConsentAction =
  | { readonly kind: "send"; readonly key: TerminalKeyName; readonly intent: ConsentIntent }
  | { readonly kind: "wait" }
  | { readonly kind: "handover"; readonly reason: string };

export interface ConsentDrive {
  /** The user's answer. Fixed for the life of the drive. */
  readonly agreed: boolean;
  readonly keysSent: number;
  readonly toggles: number;
  readonly confirmed: boolean;
  readonly handedOver: boolean;
  /** The screen we last sent a key for, to notice a keypress that did nothing. */
  readonly actedOn: string | null;
  readonly staleSightings: number;
}

export function beginConsentDrive(agreed: boolean): ConsentDrive {
  return {
    agreed,
    keysSent: 0,
    toggles: 0,
    confirmed: false,
    handedOver: false,
    actedOn: null,
    staleSightings: 0,
  };
}

/**
 * One step toward Done, verified against the screen in front of us.
 *
 * Observed ring: checkbox --down--> [Previous] --right--> [Done].
 */
const TOWARD_DONE: Readonly<Record<"checkbox" | "previous", TerminalKeyName>> = {
  checkbox: "down",
  previous: "right",
};

const TOWARD_CHECKBOX: Readonly<Record<"previous" | "done", TerminalKeyName>> = {
  previous: "up",
  done: "left",
};

function send(
  drive: ConsentDrive,
  screen: string,
  key: TerminalKeyName,
  intent: ConsentIntent,
): { action: ConsentAction; drive: ConsentDrive } {
  return {
    action: { kind: "send", key, intent },
    drive: {
      ...drive,
      keysSent: drive.keysSent + 1,
      toggles: intent === "toggle" ? drive.toggles + 1 : drive.toggles,
      confirmed: intent === "confirm",
      actedOn: screen,
      staleSightings: 0,
    },
  };
}

function handover(drive: ConsentDrive, reason: string) {
  return {
    action: { kind: "handover", reason } as const,
    drive: { ...drive, handedOver: true },
  };
}

function stepTowardCheckbox(drive: ConsentDrive, screen: string, focus: ConsentFocus) {
  if (focus === "previous" || focus === "done") {
    return send(drive, screen, TOWARD_CHECKBOX[focus], "navigate");
  }
  return handover(drive, "could not reach the checkbox");
}

/**
 * Decide the single next key from the screen as it stands.
 *
 * The confirm is guarded by three independent signals that must agree: the
 * checkbox already reads what the user chose, focus is verifiably on Done, and
 * the wizard's own footer is no longer offering Enter as a toggle. Any
 * disagreement hands the page back to the user rather than guessing — pressing
 * Enter on the wrong screen would record the opposite of their decision.
 */
export function nextConsentAction(
  drive: ConsentDrive,
  parsed: ParsedConsent,
  screen: string,
): { readonly action: ConsentAction; readonly drive: ConsentDrive } {
  if (drive.handedOver) return { action: { kind: "handover", reason: "handed over" }, drive };
  if (drive.confirmed) return { action: { kind: "wait" }, drive };
  if (drive.keysSent >= MAX_CONSENT_KEYS) return handover(drive, "too many keys");

  if (drive.actedOn === screen) {
    const staleSightings = drive.staleSightings + 1;
    if (staleSightings >= MAX_STALE_SIGHTINGS) {
      return handover(drive, "the screen did not change after a keypress");
    }
    return { action: { kind: "wait" }, drive: { ...drive, staleSightings } };
  }

  if (parsed.kind === "unparseable") return handover(drive, parsed.reason);
  const { checked, focus, enterAction } = parsed.page;
  if (focus === "unknown") return handover(drive, "cannot tell what is focused");

  if (checked !== drive.agreed) {
    if (focus !== "checkbox") return stepTowardCheckbox(drive, screen, focus);
    if (enterAction !== "toggle") return handover(drive, "Enter no longer toggles the checkbox");
    if (drive.toggles >= MAX_CONSENT_TOGGLES) return handover(drive, "the checkbox would not change");
    return send(drive, screen, "enter", "toggle");
  }

  if (focus === "done") {
    if (enterAction === "toggle") return handover(drive, "focus reads Done but Enter still toggles");
    return send(drive, screen, "enter", "confirm");
  }
  return send(drive, screen, TOWARD_DONE[focus], "navigate");
}
