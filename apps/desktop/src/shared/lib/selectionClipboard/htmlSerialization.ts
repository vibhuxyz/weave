import { isExternalHref } from "../isExternalHref";
import { ALLOWED_TAGS, DROPPED_TAGS, HTML_ESCAPES, VOID_TAGS } from "./constants";
import { displayDestination, isInsideCode, isOpaqueSchemeHref } from "./linkHelpers";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

function isRenderableImageSrc(src: string | null): src is string {
  if (!src) return false;
  const lower = src.trim().toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}


function htmlFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (!(node instanceof Element)) {
    return "";
  }

  const tagName = node.tagName.toLowerCase();

  if (DROPPED_TAGS.has(tagName)) {
    return "";
  }

  const children = Array.from(node.childNodes).map(htmlFromNode).join("");

  if (!ALLOWED_TAGS.has(tagName)) {
    return children;
  }

  if (tagName === "a") {
    const href = node.getAttribute("href");
    // A non-external destination cannot resolve outside the app, so keep the
    // label and drop the anchor rather than pasting a dead link.
    if (!isExternalHref(href ?? undefined)) {
      return children;
    }

    // Inside code, leave the text exactly as authored. `collectSelectionLinks`
    // skips these too, so neither flavor rewrites a snippet.
    if (isInsideCode(node)) {
      return children;
    }

    const anchor = `<a href="${escapeHtml(href ?? "")}">${children}</a>`;

    // Rich targets that strip mailto:/tel: anchors would leave the label as
    // bare words, which is the original bug. Spelling the address out beside
    // the anchor means it survives the strip; targets that keep the anchor
    // still get a working link, just with the address shown too.
    if (isOpaqueSchemeHref(href ?? "")) {
      const destination = displayDestination(href ?? "");
      if (!(node.textContent ?? "").includes(destination)) {
        return `${anchor} (${escapeHtml(destination)})`;
      }
    }

    return anchor;
  }

  if (tagName === "img") {
    const src = node.getAttribute("src");
    const alt = node.getAttribute("alt") ?? "";
    if (!isRenderableImageSrc(src)) {
      return escapeHtml(alt);
    }
    return `<img alt="${escapeHtml(alt)}" src="${escapeHtml(src)}" />`;
  }

  if (VOID_TAGS.has(tagName)) {
    return `<${tagName} />`;
  }

  return `<${tagName}>${children}</${tagName}>`;
}

export function selectionFragmentToHtml(fragment: DocumentFragment): string {
  return Array.from(fragment.childNodes).map(htmlFromNode).join("");
}
