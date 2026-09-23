import { MAX_CONSENT_LINES, MAX_CONSENT_LINKS, MAX_AGREEMENT_CHARS } from "./consent-limits.ts";

export interface ConsentLink {
  readonly label: string;
  readonly url: string;
}

/** Which control the wizard has focused, as far as the screen reveals. */
export type ConsentFocus = "checkbox" | "previous" | "done" | "unknown";

/** What the wizard's own footer says Enter will do right now. */
export type ConsentEnterAction = "toggle" | "confirm" | "unknown";

export interface ConsentPage {
  readonly title: string | null;
  readonly notice: string | null;
  readonly agreement: string;
  readonly checked: boolean;
  readonly links: readonly ConsentLink[];
  readonly focus: ConsentFocus;
  readonly enterAction: ConsentEnterAction;
}

export type ParsedConsent =
  | { readonly kind: "parsed"; readonly page: ConsentPage }
  | { readonly kind: "unparseable"; readonly reason: string };

const CHECKBOX = /\[([ xX])\]/;
const LINK = /^[-•]\s*([^:]{1,60}):\s*(https?:\/\/\S+)\s*$/;
const LINKS_HEADING = /^links:?$/i;
const RULE = /^[-─]{8,}$/;
const TITLE = /terms of service|data use/i;
const NOTICE = /^ai coding agents/i;
const ENTER_VERB = /\benter\s+(toggle|confirm|select)\b/gi;
const TRAILING_VERB = /\b(toggle|confirm|select)\b/i;

/**
 * The focused button renders without its brackets, behind a `>`:
 * `[Previous] > Done` means Done has focus. The checkbox line carries a `>`
 * permanently, so it is never evidence of focus.
 */
const FOCUS_DONE = />\s*Done\b/g;
const FOCUS_PREVIOUS = />\s*Previous\b/g;

function lastMatchIndex(text: string, pattern: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) last = match.index;
  }
  return last;
}

/**
 * The wizard repaints its footer without clearing, so superseded markers stay
 * in the buffer behind the current one. The last marker is the live one.
 */
function readFocus(text: string): ConsentFocus {
  const done = lastMatchIndex(text, FOCUS_DONE);
  const previous = lastMatchIndex(text, FOCUS_PREVIOUS);
  if (done < 0 && previous < 0) return "checkbox";
  return done > previous ? "done" : "previous";
}

function toEnterAction(verb: string | undefined): ConsentEnterAction {
  const normalised = verb?.toLowerCase();
  if (normalised === "toggle") return "toggle";
  if (normalised === "confirm") return "confirm";
  return "unknown";
}

/**
 * What Enter does, read next to the live focus marker.
 *
 * The footer repaints in place, so the whole history of hints is still in the
 * buffer. Once a button has focus the hint trails its marker (`> Done Confirm`)
 * with no adjacent "enter", so the verb is read from the text after the last
 * marker; with nothing focused the wizard prints the full `enter Toggle` hint.
 */
function readEnterAction(text: string, focus: ConsentFocus): ConsentEnterAction {
  if (focus === "done" || focus === "previous") {
    const marker = focus === "done" ? FOCUS_DONE : FOCUS_PREVIOUS;
    const at = lastMatchIndex(text, marker);
    const verb = TRAILING_VERB.exec(text.slice(at));
    return toEnterAction(verb?.[1]);
  }
  return toEnterAction([...text.matchAll(ENTER_VERB)].at(-1)?.[1]);
}

function readLinks(lines: readonly string[]): ConsentLink[] {
  const links: ConsentLink[] = [];
  for (const line of lines) {
    if (links.length >= MAX_CONSENT_LINKS) break;
    const match = LINK.exec(line);
    const url = match?.[2];
    if (!match?.[1] || !url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    links.push({ label: match[1].trim(), url });
  }
  return links;
}

function readAgreement(lines: readonly string[], from: number): string {
  const body: string[] = [];
  for (const line of lines.slice(from)) {
    if (LINKS_HEADING.test(line) || RULE.test(line) || /\[Done\]|>\s*Done/.test(line)) break;
    body.push(line.replace(/^>\s*/, "").replace(CHECKBOX, "").trim());
  }
  return body.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_AGREEMENT_CHARS);
}

/**
 * Read the consent page off the wizard's screen.
 *
 * Reports `unparseable` rather than guessing: the caller then shows the raw
 * terminal, which is always safe, instead of acting on a misread screen.
 */
export function parseConsentPage(lines: readonly string[]): ParsedConsent {
  const trimmed = lines.slice(-MAX_CONSENT_LINES).map((line) => line.trim());
  const boxes = trimmed.filter((line) => CHECKBOX.test(line));
  if (boxes.length === 0) return { kind: "unparseable", reason: "no checkbox line" };
  if (boxes.length > 1) return { kind: "unparseable", reason: "several checkbox lines" };

  const text = trimmed.join("\n");
  if (!/\[Done\]|>\s*Done/.test(text)) {
    return { kind: "unparseable", reason: "no Done button" };
  }

  const checkboxAt = trimmed.findIndex((line) => CHECKBOX.test(line));
  const state = CHECKBOX.exec(boxes[0] ?? "")?.[1];
  const focus = readFocus(text);

  return {
    kind: "parsed",
    page: {
      title: trimmed.find((line) => TITLE.test(line)) ?? null,
      notice: trimmed.find((line) => NOTICE.test(line)) ?? null,
      agreement: readAgreement(trimmed, checkboxAt),
      checked: state === "x" || state === "X",
      links: readLinks(trimmed),
      focus,
      enterAction: readEnterAction(text, focus),
    },
  };
}
