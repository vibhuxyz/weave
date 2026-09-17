import { appendLinkUrlsToText, collectSelectionLinks, collectSelectionTextSegments } from "./linkAnnotation";
import { selectionFragmentToHtml } from "./htmlSerialization";
import type { SelectionClipboardPayload } from "./types";

/**
 * Builds the `text/html` + `text/plain` payload for a selection.
 *
 * `text` is the browser's selection text with link URLs appended; `html` is the
 * sanitized markup with anchors intact.
 */
export function buildSelectionClipboardPayload(
  fragment: DocumentFragment,
  selectionText: string,
): SelectionClipboardPayload {
  return {
    html: selectionFragmentToHtml(fragment),
    text: appendLinkUrlsToText(
      selectionText,
      collectSelectionTextSegments(fragment),
    ),
  };
}

/**
 * True when a selection contains an external link whose URL plain text would
 * drop. Kept private so every copy path goes through
 * `buildEnrichedSelectionPayload` and shares one definition of "worth taking
 * over the clipboard for".
 */
function selectionHasRecoverableLinks(fragment: DocumentFragment): boolean {
  return collectSelectionLinks(fragment).length > 0;
}

/**
 * Builds a payload only when the selection holds a URL that plain text would
 * drop, and returns `null` when it does not.
 *
 * Every copy path shares this entry point so the "only take over the clipboard
 * when a URL is at risk" policy lives in one place. Reaching for
 * `buildSelectionClipboardPayload` directly is what let the context-menu copy
 * start attaching `text/html` to ordinary prose, turning a plain-text copy into
 * a formatted one — headings and bullets included — for selections that never
 * needed enriching.
 */
export function buildEnrichedSelectionPayload(
  fragment: DocumentFragment,
  selectionText: string,
): SelectionClipboardPayload | null {
  if (!selectionHasRecoverableLinks(fragment)) return null;
  return buildSelectionClipboardPayload(fragment, selectionText);
}

/**
 * Writes both clipboard flavors, falling back to plain text.
 *
 * `navigator.clipboard.write` is the only way to put `text/html` on the
 * clipboard, but it rejects when the webview withholds permission or the
 * document is not focused, and `ClipboardItem` is absent in older webviews. In
 * every one of those cases the URL-bearing plain text is still better than
 * nothing, so failure degrades to `writeText` instead of surfacing an error.
 */
export async function writeSelectionToClipboard(
  payload: SelectionClipboardPayload,
): Promise<void> {
  const { html, text } = payload;
  if (!text && !html) return;

  if (
    html &&
    typeof ClipboardItem === "function" &&
    navigator.clipboard?.write
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch (error) {
      console.error("[selectionClipboard] rich copy failed:", error);
    }
  }

  if (!text || !navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(text);
}
