import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/ui";
import { LIMIT_SCOPES, toFormValues, toSettings, type BudgetFormValues } from "../lib";
import type { BudgetActions, BudgetSettings } from "../types";
import { SCOPE_TEXT } from "./constants";
import { EngineRows } from "./EngineRows";
import { LIMIT_COLUMN_LABELS, LimitInputs } from "./LimitInputs";

interface BudgetFormProps {
  readonly settings: BudgetSettings;
  readonly saveBudgets: BudgetActions["saveBudgets"];
}

const GRID = "grid grid-cols-[minmax(9rem,1.2fr)_repeat(3,minmax(0,1fr))] items-start gap-x-3 gap-y-3";

export function BudgetForm({ settings, saveBudgets }: BudgetFormProps) {
  const [isSaved, setIsSaved] = useState(false);
  const { register, control, handleSubmit, setError, reset, formState } = useForm<BudgetFormValues>({ defaultValues: toFormValues(settings) });

  useEffect(() => {
    reset(toFormValues(settings));
  }, [settings, reset]);

  const submit = handleSubmit(async (values) => {
    setIsSaved(false);
    const result = await saveBudgets(toSettings(values));
    if (result.ok) setIsSaved(true);
    else setError("root", { message: result.message });
  });
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <div className={GRID}>
        <span className="text-muted-foreground text-xs">Limit</span>
        {LIMIT_COLUMN_LABELS.map((label) => <span key={label} className="text-muted-foreground text-xs">{label}</span>)}
        {LIMIT_SCOPES.map((scope) => (
          <div key={scope} className="contents">
            <div className="min-w-0 pt-2">
              <p className="text-foreground text-sm">{SCOPE_TEXT[scope].label}</p>
              <p className="text-muted-foreground text-xs leading-snug">{SCOPE_TEXT[scope].hint}</p>
            </div>
            <LimitInputs register={register} path={`scopes.${scope}`} label={SCOPE_TEXT[scope].label} errors={formState.errors.scopes?.[scope]} />
          </div>
        ))}
        <EngineRows control={control} register={register} errors={formState.errors.engines} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {formState.errors.root?.message && <p role="alert" className="mr-auto text-destructive text-xs">{formState.errors.root.message}</p>}
        {isSaved && !formState.isDirty && <p aria-live="polite" className="mr-auto text-muted-foreground text-xs">Saved to .weave/budgets.json. The next run uses these limits.</p>}
        <Button type="submit" size="sm" className="rounded-full px-5" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : "Save limits"}
        </Button>
      </div>
    </form>
  );
}
