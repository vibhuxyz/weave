import { EVENT_FENCE_LANGUAGE, MAX_PENDING_EVENT_CHARS } from "./constants.ts";

const BLOCK = new RegExp(`(?:^|\\n)\`\`\`${EVENT_FENCE_LANGUAGE}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``);
const OPENING = new RegExp(`(?:^|\\n)\`\`\`${EVENT_FENCE_LANGUAGE}`);
const SPLIT_OPENING_CHARS = EVENT_FENCE_LANGUAGE.length + 4;

export interface ExtractedBlocks {
  readonly blocks: readonly string[];
  readonly overflowedChars: number;
}

function keepOpenFence(buffer: string): string {
  const opening = OPENING.exec(buffer);
  return opening ? buffer.slice(opening.index) : buffer.slice(-SPLIT_OPENING_CHARS);
}

export class EventBlockExtractor {
  private readonly pending = new Map<string, string>();

  push(taskId: string, chunk: string): ExtractedBlocks {
    const blocks: string[] = [];
    let buffer = `${this.pending.get(taskId) ?? ""}${chunk}`;
    for (let match = BLOCK.exec(buffer); match; match = BLOCK.exec(buffer)) {
      blocks.push(match[1] ?? "");
      buffer = buffer.slice(match.index + match[0].length);
    }
    const kept = keepOpenFence(buffer);
    const overflowedChars = kept.length > MAX_PENDING_EVENT_CHARS ? kept.length : 0;
    this.pending.set(taskId, overflowedChars > 0 ? "" : kept);
    return { blocks, overflowedChars };
  }
}
