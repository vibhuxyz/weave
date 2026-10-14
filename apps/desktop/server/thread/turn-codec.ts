import { isRecord } from "@weave/core";
import type { ThreadTurnRecord } from "../storage/index.ts";
import { MAX_TURN_COMMANDS, MAX_TURN_FAILURES, MAX_TURN_FILES } from "./constants.ts";
import type { ThreadTurn, TurnFacts, TurnOutcome } from "./types.ts";

const OUTCOMES: readonly string[] = ["completed", "unfinished", "cancelled", "error"] satisfies readonly TurnOutcome[];

export interface DecodedTurns {
  readonly turns: readonly ThreadTurn[];
  readonly unreadableSeqs: readonly number[];
}

function isOutcome(value: string): value is TurnOutcome {
  return OUTCOMES.includes(value);
}

function stringList(value: unknown, maxItems: number): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "string")) return null;
  return value.slice(0, maxItems);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function parseFacts(json: string): TurnFacts | null {
  const raw = parseJson(json);
  if (!isRecord(raw)) return null;
  const files = stringList(raw.files, MAX_TURN_FILES);
  const commands = stringList(raw.commands, MAX_TURN_COMMANDS);
  const failures = stringList(raw.failures, MAX_TURN_FAILURES);
  const fileCount = raw.fileCount;
  if (files === null || commands === null || failures === null) return null;
  if (typeof fileCount !== "number" || !Number.isInteger(fileCount) || fileCount < files.length) return null;
  return { files, fileCount, commands, failures };
}

export function encodeFacts(facts: TurnFacts): string {
  return JSON.stringify(facts);
}

export function decodeTurns(records: readonly ThreadTurnRecord[]): DecodedTurns {
  const turns: ThreadTurn[] = [];
  const unreadableSeqs: number[] = [];
  for (const record of records) {
    const facts = parseFacts(record.factsJson);
    if (facts === null || !isOutcome(record.outcome)) {
      unreadableSeqs.push(record.seq);
      continue;
    }
    turns.push({
      seq: record.seq,
      engineId: record.engineId,
      userText: record.userText,
      answerText: record.answerText,
      facts,
      outcome: record.outcome,
    });
  }
  return { turns, unreadableSeqs };
}
