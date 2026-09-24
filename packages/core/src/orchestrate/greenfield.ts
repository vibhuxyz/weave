import { buildBlueprintPrompt, parseBlueprint, renderBlueprint, type Blueprint, type ParseBlueprintResult } from "../blueprint/index.ts";
import { buildContract, summarizeContract, writeContract, type Contract } from "../contracts/index.ts";
import { CONTRACT_WORKTREE_ID } from "../run-plan/index.ts";
import type { Ledger } from "../shared/index.ts";
import { createWorktree, harvestWorktree, removeWorktree } from "../worktree/index.ts";
import type { TurnRunner } from "./types.ts";

const CONTRACT_VERSION = 1;
const MAX_REPAIR_ISSUES = 20;

export interface GreenfieldBase {
  readonly blueprint: string;
  readonly contract: string;
  readonly contractShape: Pick<Contract, "exports" | "entryPath">;
  readonly baseRef: string;
}

export type GreenfieldResult = { readonly ok: true; readonly value: GreenfieldBase } | { readonly ok: false; readonly reason: string };

async function askBlueprint(request: string, runTurn: TurnRunner, signal?: AbortSignal): Promise<ParseBlueprintResult> {
  const prompt = buildBlueprintPrompt(request);
  const first = parseBlueprint(await runTurn(prompt, signal));
  if (first.ok) return first;
  const issues = first.issues.slice(0, MAX_REPAIR_ISSUES).map((issue) => `- ${issue}`).join("\n");
  const repair = `${prompt}\n\nYour previous answer was rejected:\n${issues}\nReply again with the corrected JSON only.`;
  return parseBlueprint(await runTurn(repair, signal));
}

async function commitContract(repoRoot: string, weaveDir: string, ledger: Ledger, blueprint: Blueprint): Promise<{ baseRef: string; summary: string; contract: Contract }> {
  const contract = buildContract(blueprint, CONTRACT_VERSION);
  const worktree = await createWorktree({ repoRoot, weaveDir, taskId: CONTRACT_WORKTREE_ID, runId: ledger.runId });
  try {
    await writeContract(worktree.path, contract);
    const harvested = await harvestWorktree(worktree, `weave: contract v${CONTRACT_VERSION}`);
    if (!harvested.ok) throw new Error(harvested.reason);
    ledger.append("worktree.harvested", { taskId: CONTRACT_WORKTREE_ID, commit: harvested.value.commit, files: [...harvested.value.files] });
    return { baseRef: harvested.value.commit ?? worktree.baseCommit, summary: summarizeContract(contract), contract };
  } finally {
    await removeWorktree(repoRoot, worktree);
  }
}

export async function prepareGreenfield(
  input: { readonly request: string; readonly repoRoot: string; readonly weaveDir: string; readonly ledger: Ledger },
  runTurn: TurnRunner,
  signal?: AbortSignal,
): Promise<GreenfieldResult> {
  const parsed = await askBlueprint(input.request, runTurn, signal);
  if (!parsed.ok) return { ok: false, reason: `The blueprint was invalid twice: ${parsed.issues.slice(0, MAX_REPAIR_ISSUES).join("; ")}` };
  const accepted = parsed.blueprint;
  input.ledger.writeArtifact("blueprint.json", accepted);
  const committed = await commitContract(input.repoRoot, input.weaveDir, input.ledger, accepted);
  const contractShape = { exports: committed.contract.exports, entryPath: committed.contract.entryPath };
  return { ok: true, value: { blueprint: renderBlueprint(accepted), contract: committed.summary, contractShape, baseRef: committed.baseRef } };
}
