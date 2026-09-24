import { useId } from "react";
import type { FieldErrors, Path, UseFormRegister } from "react-hook-form";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { costProblem, minutesProblem, tokensProblem, type BudgetFormValues, type LimitRowValues } from "../lib";

type RowPath = `scopes.${keyof BudgetFormValues["scopes"]}` | `engines.${number}`;

interface LimitInputsProps {
  readonly register: UseFormRegister<BudgetFormValues>;
  readonly path: RowPath;
  readonly label: string;
  readonly errors: FieldErrors<LimitRowValues> | undefined;
}

const COLUMNS = [
  { key: "costUsd", label: "Max cost (USD)", placeholder: "No limit", check: costProblem },
  { key: "tokens", label: "Max tokens", placeholder: "No limit", check: tokensProblem },
  { key: "minutes", label: "Max time (minutes)", placeholder: "No limit", check: minutesProblem },
] as const satisfies readonly { readonly key: keyof LimitRowValues; readonly label: string; readonly placeholder: string; readonly check: (value: string) => string | null }[];

export function LimitInputs({ register, path, label, errors }: LimitInputsProps) {
  const baseId = useId();
  return (
    <>
      {COLUMNS.map((column) => {
        const id = `${baseId}-${column.key}`;
        const error = errors?.[column.key]?.message;
        const name = `${path}.${column.key}` as Path<BudgetFormValues>;
        return (
          <div key={column.key} className="min-w-0">
            <label htmlFor={id} className="sr-only">{label}: {column.label}</label>
            <input
              id={id}
              inputMode="decimal"
              placeholder={column.placeholder}
              aria-invalid={error ? true : undefined}
              className={cn(FIELD, "h-10", error && "border-destructive/60")}
              {...register(name, { validate: (value) => (typeof value === "string" ? column.check(value) ?? true : true) })}
            />
            {error && <p className="mt-1 text-destructive text-xs">{error}</p>}
          </div>
        );
      })}
    </>
  );
}

export const LIMIT_COLUMN_LABELS = COLUMNS.map((column) => column.label);
