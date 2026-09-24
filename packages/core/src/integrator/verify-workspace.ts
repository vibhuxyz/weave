import { compressToolOutput } from "../compress/index.ts";
import { verifyRepo } from "../verify/index.ts";
import type { VerifyResult } from "./types.ts";

const VERIFY_DETAIL_MAX_CHARS = 3_000;

export async function verifyWithLadder(cwd: string, baseCommit: string): Promise<VerifyResult> {
  const outcome = await verifyRepo(cwd, { baseline: baseCommit });
  const output = outcome.runs.map((run) => `$ ${run.command}\n${run.output}`).join("\n");
  const detail = outcome.runs.length === 0
    ? "no verification rung is available in this repo"
    : compressToolOutput(output, VERIFY_DETAIL_MAX_CHARS);
  return { ok: outcome.ok, rungs: [...outcome.verification.used], detail };
}
