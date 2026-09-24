import type { CappedList } from "../shared/index.ts";
import { MAX_LIST_ITEMS, MAX_TEXT_CHARS } from "./constants.ts";

export function capped<T>(items: readonly T[], maxItems: number = MAX_LIST_ITEMS): CappedList<T> {
  return { items: items.slice(0, maxItems), hidden: Math.max(0, items.length - maxItems) };
}

export function flat(text: string): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length <= MAX_TEXT_CHARS ? flattened : flattened.slice(0, MAX_TEXT_CHARS);
}
