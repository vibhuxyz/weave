import { join } from "node:path";
import { buildStats, readHistory } from "@weave/core";
import { errorMessage, type BudgetClientMessage, type ServerMessage } from "../shared/index.ts";
import { loadBudgets, saveBudgets } from "./budget-file.ts";
import { WEAVE_DIR_NAME } from "./constants.ts";
import { budgetSettings, spendView } from "./settings.ts";

export interface BudgetMessageContext {
  readonly projectDir: string;
  readonly send: (msg: ServerMessage) => void;
}

async function sendBudgets(ctx: BudgetMessageContext): Promise<void> {
  try {
    const [load, history] = await Promise.all([loadBudgets(ctx.projectDir), readHistory(join(ctx.projectDir, WEAVE_DIR_NAME))]);
    const stats = buildStats(history.runs);
    ctx.send({
      type: "budgets",
      settings: load.ok ? budgetSettings(load.budgets) : {},
      spent: spendView(stats.projectSpend, history.runs.length),
      issue: load.ok ? null : load.message,
    });
  } catch (error) {
    ctx.send({ type: "budgets-failed", message: `Cannot load spending limits for ${ctx.projectDir}: ${errorMessage(error)}` });
  }
}

async function save(requestId: unknown, settings: unknown, ctx: BudgetMessageContext): Promise<void> {
  if (typeof requestId !== "string" || requestId.length === 0) {
    ctx.send({ type: "error", message: "Cannot save limits: the request has no requestId." });
    return;
  }
  const result = await saveBudgets(ctx.projectDir, settings);
  if (!result.ok) {
    ctx.send({ type: "budgets-save-failed", requestId, message: result.message });
    return;
  }
  await sendBudgets(ctx);
  ctx.send({ type: "budgets-saved", requestId });
}

export function handleBudgetMessage(msg: BudgetClientMessage, ctx: BudgetMessageContext): Promise<void> {
  return msg.type === "read-budgets" ? sendBudgets(ctx) : save(msg.requestId, msg.settings, ctx);
}
