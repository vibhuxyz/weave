import type { HistoryArchive } from "./types.ts";

function isRunTurn(turn: unknown): boolean {
  return typeof turn === "object" && turn !== null && "run" in turn && turn.run !== undefined;
}

export function archiveHasRunTurn(archive: HistoryArchive): boolean {
  return archive.turns.some(isRunTurn);
}
