import type { ChatImageAttachment, ChatTurn, ToolEntry } from "./types";

const MAX_ARCHIVE_BYTES = 7 * 1024 * 1024;
const MAX_ARCHIVED_TEXT_CHARS = 8_000;
const TRUNCATED_SUFFIX = "\n[trimmed when archived]";
const BLOB_URL_PREFIX = "blob:";
const TURN_ROLES: ReadonlySet<string> = new Set(["user", "assistant", "notice"]);
const ENCODER = new TextEncoder();

export interface HistoryArchivePayload {
  readonly turns: readonly ChatTurn[];
  readonly droppedTurnCount: number;
}

function capText(text: string): string {
  return text.length <= MAX_ARCHIVED_TEXT_CHARS ? text : `${text.slice(0, MAX_ARCHIVED_TEXT_CHARS)}${TRUNCATED_SUFFIX}`;
}

function archiveImage(image: ChatImageAttachment): ChatImageAttachment {
  if (!image.previewUrl.startsWith(BLOB_URL_PREFIX)) return image;
  return { ...image, previewUrl: "", unavailable: image.path ? image.unavailable : true };
}

function archiveTool(tool: ToolEntry): ToolEntry {
  return tool.output === undefined ? tool : { ...tool, output: capText(tool.output) };
}

function archiveTurn(turn: ChatTurn): ChatTurn {
  return {
    ...turn,
    thought: capText(turn.thought),
    tools: turn.tools.map(archiveTool),
    images: turn.images?.map(archiveImage),
  };
}

function byteSize(turn: ChatTurn): number {
  return ENCODER.encode(JSON.stringify(turn)).byteLength;
}

function firstTurnWithinBudget(sizes: readonly number[]): number {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const lastIndex = sizes.length - 1;
  const result = sizes.reduce(
    (state, size, index) =>
      state.remaining > MAX_ARCHIVE_BYTES && index < lastIndex
        ? { start: index + 1, remaining: state.remaining - size }
        : state,
    { start: 0, remaining: total },
  );
  return result.start;
}

export function buildHistoryArchive(turns: readonly ChatTurn[], noticeId: string): HistoryArchivePayload | null {
  const noticeIndex = turns.findIndex((turn) => turn.id === noticeId);
  if (noticeIndex < 0) return null;
  const window = turns.slice(0, noticeIndex + 1);
  const priorGap = window.find((turn) => turn.historyGap !== undefined)?.historyGap ?? 0;
  const kept = window.filter((turn) => turn.historyGap === undefined).map(archiveTurn);
  const start = firstTurnWithinBudget(kept.map(byteSize));
  return { turns: kept.slice(start), droppedTurnCount: priorGap + start };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArchivedTurn(value: unknown): value is ChatTurn {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    TURN_ROLES.has(value.role) &&
    typeof value.text === "string" &&
    typeof value.thought === "string" &&
    Array.isArray(value.tools)
  );
}

export function restoreArchivedTurns(raw: readonly unknown[], droppedTurnCount: number): ChatTurn[] {
  const turns = raw.filter(isArchivedTurn);
  const gap = droppedTurnCount + (raw.length - turns.length);
  if (gap === 0) return turns;
  const gapTurn: ChatTurn = { id: "history-gap", role: "notice", text: "", thought: "", tools: [], historyGap: gap };
  return [gapTurn, ...turns];
}
