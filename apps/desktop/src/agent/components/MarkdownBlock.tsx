import type { MarkdownBlock as MarkdownBlockModel } from "../normalize/types";
import { Prose } from "./Prose";

/**
 * Fallback renderer for agent text the normalizer could not structure into a
 * richer block.
 */
export function MarkdownBlock({ block }: { block: MarkdownBlockModel }) {
  return <Prose>{block.text}</Prose>;
}
