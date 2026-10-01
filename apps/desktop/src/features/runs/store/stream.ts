import type { ChatTurn, ToolEntry, TurnSegment } from "@/features/chat/hooks";
import type { RunToolCall, RunToolPatch, RunUpdate } from "../../../../server/index.ts";
import { MAX_BLOCK_FILES, MAX_BLOCK_TEXT_CHARS, MAX_STREAM_BLOCKS, MAX_TOOLS_PER_BLOCK } from "../constants";
import type { StreamBlock } from "../types";
import { appendText, appendThought, appendTool } from "./segments";

type StreamUpdate = Extract<RunUpdate, { readonly taskId: string }>;

function emptyBlock(taskId: string, attempt: number, index: number): StreamBlock {
  return {
    id: `${taskId}#${index}`,
    taskId,
    attempt,
    status: "running",
    turn: { id: `${taskId}#${index}`, role: "assistant", text: "", thought: "", tools: [], segments: [] },
    files: [],
    hiddenFileCount: 0,
    hiddenToolCount: 0,
  };
}

function toolEntryOf(tool: RunToolCall): ToolEntry {
  return {
    id: tool.id,
    title: tool.title,
    kind: tool.toolKind,
    status: tool.status,
    ...(tool.command === undefined ? {} : { rawInput: { command: tool.command } }),
  };
}

function patchedTool(tool: ToolEntry, patch: RunToolPatch): ToolEntry {
  return {
    ...tool,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.toolKind === undefined ? {} : { kind: patch.toolKind }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
  };
}

function withTurn(block: StreamBlock, turn: ChatTurn): StreamBlock {
  return { ...block, turn };
}

function cappedTail(segments: TurnSegment[]): TurnSegment[] {
  const last = segments.at(-1);
  if (last === undefined) return segments;
  if (last.kind !== "text" && last.kind !== "thought") return segments;
  if (last.text.length <= MAX_BLOCK_TEXT_CHARS) return segments;
  return [...segments.slice(0, -1), { ...last, text: last.text.slice(-MAX_BLOCK_TEXT_CHARS) }];
}

function withText(block: StreamBlock, chunk: string): StreamBlock {
  const { turn } = block;
  return withTurn(block, {
    ...turn,
    text: (turn.text + chunk).slice(-MAX_BLOCK_TEXT_CHARS),
    segments: cappedTail(appendText(turn.segments ?? [], chunk)),
  });
}

function withThought(block: StreamBlock, chunk: string): StreamBlock {
  const { turn } = block;
  return withTurn(block, {
    ...turn,
    thought: (turn.thought + chunk).slice(-MAX_BLOCK_TEXT_CHARS),
    segments: cappedTail(appendThought(turn.segments ?? [], chunk)),
  });
}

function withTool(block: StreamBlock, tool: RunToolCall): StreamBlock {
  const { turn } = block;
  if (turn.tools.length >= MAX_TOOLS_PER_BLOCK) return { ...block, hiddenToolCount: block.hiddenToolCount + 1 };
  return withTurn(block, {
    ...turn,
    tools: [...turn.tools, toolEntryOf(tool)],
    segments: appendTool(turn.segments ?? [], tool.id),
  });
}

function withToolPatch(block: StreamBlock, patch: RunToolPatch): StreamBlock | null {
  const { turn } = block;
  if (!turn.tools.some((tool) => tool.id === patch.id)) return null;
  return withTurn(block, {
    ...turn,
    tools: turn.tools.map((tool) => (tool.id === patch.id ? patchedTool(tool, patch) : tool)),
  });
}

function withFile(block: StreamBlock, path: string): StreamBlock {
  if (block.files.includes(path)) return block;
  if (block.files.length >= MAX_BLOCK_FILES) return { ...block, hiddenFileCount: block.hiddenFileCount + 1 };
  return { ...block, files: [...block.files, path] };
}

function replacedAt(blocks: readonly StreamBlock[], index: number, block: StreamBlock): readonly StreamBlock[] {
  return blocks.map((current, at) => (at === index ? block : current));
}

function appended(blocks: readonly StreamBlock[], block: StreamBlock): { readonly blocks: readonly StreamBlock[]; readonly dropped: number } {
  const next = [...blocks, block];
  if (next.length <= MAX_STREAM_BLOCKS) return { blocks: next, dropped: 0 };
  return { blocks: next.slice(next.length - MAX_STREAM_BLOCKS), dropped: next.length - MAX_STREAM_BLOCKS };
}

function lastIndexWhere(blocks: readonly StreamBlock[], matches: (block: StreamBlock) => boolean): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block && matches(block)) return index;
  }
  return -1;
}

function openBlockIndex(blocks: readonly StreamBlock[], taskId: string): number {
  const index = lastIndexWhere(blocks, (block) => block.taskId === taskId);
  return index !== -1 && blocks[index]?.status === "running" ? index : -1;
}

function lastAttemptOf(blocks: readonly StreamBlock[], taskId: string): number {
  return blocks.filter((block) => block.taskId === taskId).at(-1)?.attempt ?? 0;
}

function nextAttemptOf(blocks: readonly StreamBlock[], taskId: string): number {
  return lastAttemptOf(blocks, taskId) + 1;
}

function sameAttemptOf(blocks: readonly StreamBlock[], taskId: string): number {
  return Math.max(1, lastAttemptOf(blocks, taskId));
}

export interface StreamState {
  readonly stream: readonly StreamBlock[];
  readonly hiddenBlockCount: number;
}

function settled(state: StreamState, taskId: string, status: StreamBlock["status"]): StreamState {
  const index = lastIndexWhere(state.stream, (block) => block.taskId === taskId);
  const block = index === -1 ? undefined : state.stream[index];
  if (!block) return state;
  return { ...state, stream: replacedAt(state.stream, index, { ...block, status }) };
}

function patched(state: StreamState, patch: RunToolPatch): StreamState {
  const index = lastIndexWhere(state.stream, (block) => block.turn.tools.some((tool) => tool.id === patch.id));
  const block = index === -1 ? undefined : state.stream[index];
  const next = block === undefined ? null : withToolPatch(block, patch);
  return next === null ? state : { ...state, stream: replacedAt(state.stream, index, next) };
}

function grown(state: StreamState, taskId: string, grow: (block: StreamBlock) => StreamBlock): StreamState {
  const index = openBlockIndex(state.stream, taskId);
  if (index !== -1) {
    const block = state.stream[index];
    return block === undefined ? state : { ...state, stream: replacedAt(state.stream, index, grow(block)) };
  }
  const fresh = grow(emptyBlock(taskId, sameAttemptOf(state.stream, taskId), state.stream.length + state.hiddenBlockCount));
  const { blocks, dropped } = appended(state.stream, fresh);
  return { stream: blocks, hiddenBlockCount: state.hiddenBlockCount + dropped };
}

export function applyStreamUpdate(state: StreamState, update: StreamUpdate): StreamState {
  switch (update.kind) {
    case "task-started": {
      const started = emptyBlock(update.taskId, nextAttemptOf(state.stream, update.taskId), state.stream.length + state.hiddenBlockCount);
      const { blocks, dropped } = appended(state.stream, started);
      return { stream: blocks, hiddenBlockCount: state.hiddenBlockCount + dropped };
    }
    case "text":
      return grown(state, update.taskId, (block) => withText(block, update.text));
    case "thought":
      return grown(state, update.taskId, (block) => withThought(block, update.text));
    case "tool":
      return grown(state, update.taskId, (block) => withTool(block, update.tool));
    case "tool-update":
      return patched(state, update.tool);
    case "file":
      return grown(state, update.taskId, (block) => withFile(block, update.path));
    case "task-settled":
      return settled(state, update.taskId, update.status);
    default:
      return state;
  }
}
