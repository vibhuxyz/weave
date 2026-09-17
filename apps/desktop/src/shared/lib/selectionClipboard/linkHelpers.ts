import { OPAQUE_SCHEME_PATTERN } from "./constants";

export function isOpaqueSchemeHref(href: string): boolean {
  return OPAQUE_SCHEME_PATTERN.test(href.trim());
}


export function displayDestination(href: string): string {
  return href.trim().replace(OPAQUE_SCHEME_PATTERN, "");
}
export function isInsideCode(node: Element): boolean {
  return node.closest("pre, code") !== null;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
