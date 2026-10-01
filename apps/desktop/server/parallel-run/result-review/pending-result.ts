import { acceptRun, discardRun, type DeliveryPlan } from "@weave/core";
import type { ResultDecision, RunUpdate, ServerMessage } from "../../shared/index.ts";
import { ALREADY_DECIDED } from "./constants.ts";

type DecisionUpdate = Extract<RunUpdate, { readonly kind: "result-decision" }>;

export interface OfferedResult {
  readonly runKey: string;
  readonly projectDir: string;
  readonly plan: DeliveryPlan;
}

export interface PendingResult {
  readonly offer: (result: OfferedResult | null) => void;
  readonly decide: (runKey: string, decision: ResultDecision, send: (message: ServerMessage) => void) => Promise<void>;
}

async function decided(result: OfferedResult, decision: ResultDecision): Promise<DecisionUpdate> {
  const delivered = decision === "accept" ? await acceptRun(result.projectDir, result.plan) : await discardRun(result.projectDir, result.plan);
  if (!delivered.ok) return { kind: "result-decision", status: "refused", summary: delivered.reason };
  return { kind: "result-decision", status: decision === "accept" ? "accepted" : "discarded", summary: delivered.summary };
}

export function createPendingResult(): PendingResult {
  const held: { result: OfferedResult | null } = { result: null };
  return {
    offer: (result) => {
      held.result = result;
    },
    decide: async (runKey, decision, send) => {
      const result = held.result;
      if (result?.runKey !== runKey) return send({ type: "error", message: ALREADY_DECIDED });
      held.result = null;
      const update = await decided(result, decision);
      if (update.status === "refused" && held.result === null) held.result = result;
      send({ type: "run-update", runKey, update });
    },
  };
}
