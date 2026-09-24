import { useEffect } from "react";
import { formatNumber } from "@/shared/i18n";
import { useBudgetState } from "../hooks";
import type { BudgetActions, SpendView } from "../types";
import { BudgetForm } from "./BudgetForm";

const MS_PER_MINUTE = 60_000;
const MINUTES = { style: "unit", unit: "minute", unitDisplay: "short", maximumFractionDigits: 1 } as const;

function SpentLine({ spent }: { readonly spent: SpendView }) {
  if (spent.runs === 0) return <p className="text-muted-foreground text-sm">No runs recorded yet, so nothing has been spent.</p>;
  return (
    <p className="text-muted-foreground text-sm">
      Spent so far across {spent.runs} recorded {spent.runs === 1 ? "run" : "runs"}: ${spent.costUsd}, {formatNumber(spent.tokens)} tokens, {formatNumber(spent.wallMs / MS_PER_MINUTE, MINUTES)} of engine time.
    </p>
  );
}

export function BudgetSection({ actions }: { readonly actions: BudgetActions }) {
  const state = useBudgetState();
  const { readBudgets } = actions;

  useEffect(() => {
    readBudgets();
  }, [readBudgets]);

  return (
    <section className="space-y-4" aria-label="Spending limits">
      <div>
        <h2 className="font-medium text-base text-foreground">Spending limits</h2>
        <p className="mt-1 text-muted-foreground text-sm">Limits for /parallel runs in this project. Leave a box empty for no limit.</p>
      </div>
      {state.status === "idle" && <p className="text-muted-foreground text-sm">Open a project to set its limits.</p>}
      {state.status === "loading" && <p role="status" className="text-muted-foreground text-sm">Loading limits…</p>}
      {state.status === "error" && <p role="alert" className="text-destructive text-sm">{state.message}</p>}
      {state.status === "ready" && (
        <>
          <SpentLine spent={state.spent} />
          {state.issue && <p role="alert" className="rounded-xl border border-destructive/40 px-4 py-3 text-destructive text-sm">{state.issue}. Runs will not start until this is fixed; saving here replaces the file.</p>}
          <BudgetForm settings={state.settings} saveBudgets={actions.saveBudgets} />
        </>
      )}
    </section>
  );
}
