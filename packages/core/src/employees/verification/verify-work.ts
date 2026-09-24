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

export interface WorkVerification {
  readonly ok: boolean;
  readonly checks: readonly RungCheck[];
  readonly detail: string;
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
  const failed = checks.filter((check) => !check.ok);
  const detail = failed.length > 0 ? failed.map((check) => check.detail).join("; ") : checks.length > 0 ? `passed ${checks.map((check) => check.rung).join(", ")}` : "no rungs to run";
  return { ok: failed.length === 0, checks, detail };
}
