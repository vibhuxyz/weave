import { MessageResponse } from "@/shared/ui/ai-elements/message";
import type { MarkdownBlock as MarkdownBlockModel } from "../normalize/types";

export function MarkdownBlock({ block }: { block: MarkdownBlockModel }) {
  return <MessageResponse>{block.text}</MessageResponse>;
}

