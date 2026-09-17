import { isExternalHref } from "../isExternalHref";
import { URL_CONTINUATION_CHARACTER } from "./constants";
import { displayDestination, isInsideCode, normalizeWhitespace } from "./linkHelpers";
import type { SelectionLink, SelectionTextSegment } from "./types";

/**
 * True when a link's visible label already is its destination, so appending the
 * URL would only produce `https://x (https://x)`.
 *
 * Compared after dropping the scheme, a leading `www.`, and any trailing slash,
 * because Markdown renderers commonly show a bare host for a full URL. The
 * comparison is whole-string, not substring: a label like `docs` is a substring
 * of `https://example.com/docs` while carrying none of its information, and
 * treating that as redundant is exactly how the URL goes missing.
 */
function stripHrefForComparison(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

function containsDestinationToken(label: string, destination: string): boolean {
  if (!destination) return false;

  let index = label.indexOf(destination);
  while (index !== -1) {
    const before = label[index - 1];
    const after = label[index + destination.length];
    const boundedStart =
      before === undefined || !URL_CONTINUATION_CHARACTER.test(before);
    const boundedEnd =
      after === undefined || !URL_CONTINUATION_CHARACTER.test(after);

    if (boundedStart && boundedEnd) return true;
    index = label.indexOf(destination, index + 1);
  }

  return false;
}

function isLabelRedundantWithHref(label: string, href: string): boolean {
  const normalizedLabel = normalizeWhitespace(label);
  const strippedLabel = stripHrefForComparison(label);
  const strippedHref = stripHrefForComparison(href);

  if (strippedLabel === strippedHref) return true;

  // A label can also *contain* the destination, e.g. "Note: example.com". Match
  // the full href as well as the stripped form so a label that spells out the
  // scheme ("see https://example.com/docs") is recognized too.
  return (
    containsDestinationToken(normalizedLabel, normalizeWhitespace(href)) ||
    containsDestinationToken(normalizedLabel, strippedHref)
  );
}

/**
 * True when an anchor's destination should be spelled out beside its label.
 *
 * Shared by the plain-text annotation walk and `collectSelectionLinks` so there
 * is one definition of an annotatable link.
 */
function isAnnotatableAnchor(anchor: Element): boolean {
  const href = anchor.getAttribute("href");
  if (!isExternalHref(href ?? undefined)) return false;
  if (isInsideCode(anchor)) return false;

  const label = normalizeWhitespace(anchor.textContent ?? "");
  if (!label) return false;

  return !isLabelRedundantWithHref(label, href as string);
}

/**
 * Collects the external links in a selection, in document order.
 *
 * Anchors inside `pre`/`code` are skipped: that text is copied to be run or
 * compiled, so injecting a URL would corrupt it. Anchors whose label already
 * shows the destination are skipped too.
 */
export function collectSelectionLinks(
  fragment: DocumentFragment,
): SelectionLink[] {
  const links: SelectionLink[] = [];

  for (const anchor of Array.from(fragment.querySelectorAll("a[href]"))) {
    if (!isAnnotatableAnchor(anchor)) continue;

    links.push({
      href: anchor.getAttribute("href") as string,
      label: normalizeWhitespace(anchor.textContent ?? ""),
    });
  }

  return links;
}

/**
 * Splits a selection into text runs in document order, tagging each with the
 * link it belongs to.
 *
 * Consecutive text nodes under the same anchor are merged so the annotation
 * lands after the whole label, not after its first text node — a label like
 * `<a><strong>bold</strong> link</a>` is one run, not two.
 */
export function collectSelectionTextSegments(
  fragment: DocumentFragment,
): SelectionTextSegment[] {
  const segments: SelectionTextSegment[] = [];
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  let previousAnchor: Element | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (!text) continue;

    const anchor = node.parentElement?.closest("a[href]") ?? null;
    const annotatable = anchor !== null && isAnnotatableAnchor(anchor);
    const previous = segments.at(-1);

    if (annotatable && anchor === previousAnchor && previous) {
      previous.text += text;
      continue;
    }

    segments.push({
      href: annotatable ? anchor.getAttribute("href") : null,
      text,
    });
    previousAnchor = annotatable ? anchor : null;
  }

  return segments;
}

/**
 * Returns the index just past `segmentText` in `text`, searching from `from`.
 *
 * Tries an exact match first, then tolerates whitespace runs differing between
 * the DOM and the selection text: a label wrapped across lines renders as `\n`
 * in the selection text while the source markup holds a single space.
 */
function findSegmentEnd(
  text: string,
  segmentText: string,
  from: number,
): number | null {
  // Whitespace-only runs carry no position information; skipping them lets the
  // surrounding runs match against whatever the browser produced.
  if (!segmentText.trim()) return null;

  const exact = text.indexOf(segmentText, from);
  if (exact !== -1) return exact + segmentText.length;

  const pattern = segmentText
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(text.slice(from));
  if (!match) return null;

  return from + match.index + match[0].length;
}

/**
 * Appends ` (url)` after each link label in the plain-text flavor.
 *
 * The base text is `Selection.toString()`, which carries the browser's own line
 * breaking, so it is kept verbatim and only annotated rather than rebuilt from
 * the DOM. Position comes from the DOM though: the walk consumes *every* run in
 * document order, linked or not, so a label is annotated at its own occurrence.
 * Searching the text for the label instead would annotate the first textual
 * match, which in `docs and <a>docs</a>` is the unlinked word — leaving the
 * copied link without its URL, the very bug this module exists to fix.
 *
 * A run that cannot be located (whitespace collapsed differently, or clipped
 * mid-selection) is skipped without advancing, so later runs still line up.
 */
export function appendLinkUrlsToText(
  text: string,
  segments: readonly SelectionTextSegment[],
): string {
  if (!segments.some((segment) => segment.href)) return text;

  let result = "";
  let cursor = 0;

  for (const segment of segments) {
    const end = findSegmentEnd(text, segment.text, cursor);
    if (end === null) continue;

    result += text.slice(cursor, end);
    cursor = end;

    if (!segment.href) continue;

    const destination = displayDestination(segment.href);
    // Already annotated by the author, e.g. "docs (https://example.com)".
    if (!text.slice(cursor).startsWith(` (${destination})`)) {
      result += ` (${destination})`;
    }
  }

  return result + text.slice(cursor);
}
