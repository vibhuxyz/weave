import {
  isRecord,
  parseJsonBlock,
  readChoice,
  readList,
  readOptionalString,
  readString,
  unparsedIssue,
} from "../../shared/index.ts";
import {
  MAX_DETAIL_CHARS,
  MAX_EVIDENCE_PER_FINDING,
  MAX_FINDING_CHARS,
  MAX_HYPOTHESIS_CHARS,
  MAX_SYMBOL_CHARS,
} from "../constants.ts";
import { CONFIDENCE_LEVELS, type Evidence, type Finding } from "../types.ts";

const MAX_EXCERPT_CHARS = 200;
const MAX_PATH_CHARS = 400;
const MAX_LINE_NUMBER = 1_000_000;

export interface FindingSource {
  readonly worker: string;
  readonly questionId: string;
}

export type ParseFindingResult =
  | { readonly ok: true; readonly finding: Finding }
  | { readonly ok: false; readonly issues: readonly string[] };

function readLine(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw > 0 && raw <= MAX_LINE_NUMBER ? raw : null;
}

function parseEvidence(raw: unknown, where: string, issues: string[]): Evidence | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx = { record: raw, where, issues };
  const file = readString(ctx, "file", MAX_PATH_CHARS);
  if (file === null) return null;
  return {
    file,
    symbol: readOptionalString(ctx, "symbol", MAX_SYMBOL_CHARS),
    line: readLine(raw["line"]),
    detail: readOptionalString(ctx, "detail", MAX_DETAIL_CHARS),
  };
}

export function parseFinding(text: string, source: FindingSource): ParseFindingResult {
  const block = parseJsonBlock(text);
  if (!block.ok) return { ok: false, issues: [unparsedIssue(block.issue, text, MAX_EXCERPT_CHARS)] };
  if (!isRecord(block.value)) return { ok: false, issues: ["The answer must be a JSON object"] };

  const issues: string[] = [];
  const ctx = { record: block.value, where: `finding from ${source.worker}`, issues };
  const finding = readString(ctx, "finding", MAX_FINDING_CHARS);
  const confidence = readChoice(ctx, "confidence", CONFIDENCE_LEVELS);
  const hypothesis = readOptionalString(ctx, "hypothesis", MAX_HYPOTHESIS_CHARS);
  const evidence = readList(ctx, "evidence", MAX_EVIDENCE_PER_FINDING, parseEvidence);

  if (finding === null || confidence === null) return { ok: false, issues };
  if (evidence.length === 0) {
    issues.push(`${ctx.where}: "evidence" must name at least one file`);
    return { ok: false, issues };
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    finding: {
      id: `${source.questionId}:${source.worker}`,
      questionId: source.questionId,
      worker: source.worker,
      finding,
      hypothesis,
      confidence,
      evidence,
    },
  };
}
