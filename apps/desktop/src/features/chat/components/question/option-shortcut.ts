import type { KeyboardEvent } from "react";

const SHORTCUT_PATTERN = /^[1-9]$/;

function isTyping(target: EventTarget): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function shortcutIndexOf(event: KeyboardEvent<HTMLElement>): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return null;
  return SHORTCUT_PATTERN.test(event.key) ? Number(event.key) - 1 : null;
}
