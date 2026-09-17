export const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';


export const WRAPPABLE_ANCESTOR_TAGS = new Set([
  "a",
  "b",
  "code",
  "del",
  "em",
  "i",
  "pre",
  "s",
  "strong",
]);

export const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

export const DROPPED_TAGS = new Set(["script", "style", "template"]);

export const VOID_TAGS = new Set(["br", "hr", "img"]);

export const OPAQUE_SCHEME_PATTERN = /^(mailto|tel):/i;


export const URL_CONTINUATION_CHARACTER = /[A-Za-z0-9._~:/?#@!$&'*+,;=%-]/;
