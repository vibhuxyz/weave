import type { VerificationRung } from "@weave/protocol";
import { intake } from "../../intake/index.ts";
import { flatten } from "../../shared/index.ts";
import { runDetectedRung } from "../../verify/index.ts";
import type { VerificationPolicy } from "../model/index.ts";

const MAX_DETAIL_CHARS = 600;

export interface RungCheck {
  readonly rung: VerificationRung;
  readonly ok: boolean;
  readonly wallMs: number;
  readonly detail: string;
}

export type VerificationVerdict = "passed" | "failed" | "unverified";

export interface WorkVerification {
  readonly ok: boolean;
  readonly verdict: VerificationVerdict;
  readonly checks: readonly RungCheck[];
  readonly detail: string;
}

const UNVERIFIED_DETAIL = "no checks could run in this project, so the work is unverified";

function verdictOf(checks: readonly RungCheck[]): VerificationVerdict {
  if (checks.some((check) => !check.ok)) return "failed";
  return checks.length === 0 ? "unverified" : "passed";
}

export async function verifyEmployeeWork(cwd: string, policy: VerificationPolicy): Promise<WorkVerification> {
  const detected = await intake(cwd);
  const checks: RungCheck[] = [];
  for (const rung of [...policy.required, ...policy.preferred]) {
    const entry = detected.detected.find((candidate) => candidate.rung === rung);
    if (!entry) {
      if (policy.required.includes(rung)) checks.push({ rung, ok: false, wallMs: 0, detail: `required rung ${rung} is not available in this project` });
      continue;
    }
    const run = await runDetectedRung(entry, cwd, {});
    checks.push({ rung, ok: run.ok, wallMs: run.wallMs, detail: run.ok ? `${run.command} passed` : `${run.command} failed: ${flatten(run.output).slice(-MAX_DETAIL_CHARS)}` });
  }
  const verdict = verdictOf(checks);
  const failed = checks.filter((check) => !check.ok);
  const detail = verdict === "failed" ? failed.map((check) => check.detail).join("; ") : verdict === "passed" ? `passed ${checks.map((check) => check.rung).join(", ")}` : UNVERIFIED_DETAIL;
  return { ok: verdict !== "failed", verdict, checks, detail };
}
