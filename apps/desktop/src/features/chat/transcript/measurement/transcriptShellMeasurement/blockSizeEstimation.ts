import type { Message, MessageContent } from "@/shared/types/messages";
import type { TranscriptRowKind } from "../transcriptMeasurementPolicy";
import {
  ACTION_REQUIRED_BLOCK_SIZE,
  ASSISTANT_MESSAGE_CHROME_SIZE,
  ATTACHMENT_STRIP_BLOCK_SIZE,
  CHIP_STRIP_BLOCK_SIZE,
  DEFAULT_MESSAGE_CHROME_SIZE,
  IMAGE_RESERVED_BLOCK_SIZE,
  MCP_APP_RESERVED_BLOCK_SIZE,
  MIN_SHELL_BLOCK_SIZE,
  REASONING_BASE_BLOCK_SIZE,
  REDACTED_REASONING_BLOCK_SIZE,
  STATIC_ROW_SIZE,
  SYSTEM_NOTICE_BASE_BLOCK_SIZE,
  TEXT_LINE_SIZE,
  TEXT_WRAP_COLUMNS,
  TOOL_REQUEST_BLOCK_SIZE,
  TOOL_RESPONSE_BASE_BLOCK_SIZE,
} from "./constants";
import type { TranscriptShellMeasurementBlock } from "./types";

export function normalizeBlockSize(value: number): number {
  return Math.max(MIN_SHELL_BLOCK_SIZE, Math.ceil(value));
}

function estimateTextBlockSize(text: string): number {
  const hardLines = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const softLines = Math.max(1, Math.ceil(text.length / TEXT_WRAP_COLUMNS));
  return normalizeBlockSize(Math.max(hardLines, softLines) * TEXT_LINE_SIZE);
}

function getMessageChromeSize(message: Message | undefined): number {
  if (!message) {
    return DEFAULT_MESSAGE_CHROME_SIZE;
  }
  return message.role === "assistant"
    ? ASSISTANT_MESSAGE_CHROME_SIZE
    : DEFAULT_MESSAGE_CHROME_SIZE;
}

function getContentBlockKey(block: MessageContent, index: number): string {
  if ("id" in block && typeof block.id === "string") {
    return `${block.type}:${block.id}`;
  }
  return `${block.type}:${index}`;
}

export function createContentShellBlock(
  block: MessageContent,
  index: number,
): TranscriptShellMeasurementBlock {
  const key = getContentBlockKey(block, index);

  switch (block.type) {
    case "text":
      return {
        key,
        kind: "text",
        estimatedBlockSize: estimateTextBlockSize(block.text),
      };
    case "systemNotification":
      return {
        key,
        kind: "system-notice",
        estimatedBlockSize:
          SYSTEM_NOTICE_BASE_BLOCK_SIZE + estimateTextBlockSize(block.text),
      };
    case "image":
      return {
        key,
        kind: "image",
        estimatedBlockSize: IMAGE_RESERVED_BLOCK_SIZE,
        reservedBlockSize: IMAGE_RESERVED_BLOCK_SIZE,
        pendingReason: "image-loading",
      };
    case "toolRequest":
      return {
        key,
        kind: "tool",
        estimatedBlockSize: TOOL_REQUEST_BLOCK_SIZE,
      };
    case "toolResponse":
      return {
        key,
        kind: "tool",
        estimatedBlockSize:
          TOOL_RESPONSE_BASE_BLOCK_SIZE + estimateTextBlockSize(block.result),
      };
    case "mcpApp":
      return {
        key,
        kind: "mcp-app",
        estimatedBlockSize: MCP_APP_RESERVED_BLOCK_SIZE,
        reservedBlockSize: MCP_APP_RESERVED_BLOCK_SIZE,
        pendingReason: "mcp-iframe-sizing",
      };
    case "thinking":
    case "reasoning":
      return {
        key,
        kind: "reasoning",
        estimatedBlockSize:
          REASONING_BASE_BLOCK_SIZE + estimateTextBlockSize(block.text),
        pendingReason: "reasoning-animation",
      };
    case "redactedThinking":
      return {
        key,
        kind: "reasoning",
        estimatedBlockSize: REDACTED_REASONING_BLOCK_SIZE,
      };
    case "actionRequired":
      return {
        key,
        kind: "action-required",
        estimatedBlockSize: ACTION_REQUIRED_BLOCK_SIZE,
      };
    default:
      block satisfies never;
      return {
        key,
        kind: "unknown",
        estimatedBlockSize: DEFAULT_MESSAGE_CHROME_SIZE,
      };
  }
}

export function createMetadataShellBlocks(
  message: Message | undefined,
): TranscriptShellMeasurementBlock[] {
  const blocks: TranscriptShellMeasurementBlock[] = [];

  if (message?.metadata?.attachments?.length) {
    blocks.push({
      key: `attachments:${message.id}`,
      kind: "attachment-strip",
      estimatedBlockSize: ATTACHMENT_STRIP_BLOCK_SIZE,
    });
  }

  if (message?.metadata?.chips?.length) {
    blocks.push({
      key: `chips:${message.id}`,
      kind: "chip-strip",
      estimatedBlockSize: CHIP_STRIP_BLOCK_SIZE,
    });
  }

  return blocks;
}

export function getReservedBlockSize(
  blocks: readonly TranscriptShellMeasurementBlock[],
): number | null {
  const total = blocks.reduce((sum, block) => {
    return sum + (block.reservedBlockSize ?? 0);
  }, 0);
  return total > 0 ? normalizeBlockSize(total) : null;
}

export function getEstimatedBlockSize({
  estimatedBlockSize,
  message,
  rowKind,
  blocks,
}: {
  estimatedBlockSize: number | undefined;
  message: Message | undefined;
  rowKind: TranscriptRowKind;
  blocks: readonly TranscriptShellMeasurementBlock[];
}): number {
  if (estimatedBlockSize !== undefined) {
    return normalizeBlockSize(estimatedBlockSize);
  }

  if (rowKind === "date-separator" || rowKind === "top-loading-sentinel") {
    return STATIC_ROW_SIZE;
  }

  const contentBlockSize = blocks.reduce(
    (sum, block) => sum + block.estimatedBlockSize,
    0,
  );
  return normalizeBlockSize(getMessageChromeSize(message) + contentBlockSize);
}
