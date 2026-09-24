import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { idFromName, toEmployeeFields, type EmployeeActions, type EmployeeFormValues } from "@/features/employees";
import type { EmployeeDialogState } from "@/features/agents/hooks";
import { Button, Sheet, SheetContent, SheetTitle } from "@/shared/ui";
import { IdentityFields, PermissionFields, PolicyFields } from "../employee-form-fields";
import { DIALOG_TITLES, defaultValuesFor, replacesIdFor } from "./default-values";

interface EmployeeDialogProps {
  readonly state: EmployeeDialogState;
  readonly saveEmployee: EmployeeActions["saveEmployee"];
  readonly onClose: () => void;
  readonly onSaved: (id: string, replacedId: string | null) => void;
}

export function EmployeeDialog({ state, saveEmployee, onClose, onSaved }: EmployeeDialogProps) {
  const { register, control, handleSubmit, setError, setValue, watch, formState } = useForm<EmployeeFormValues>({
    defaultValues: defaultValuesFor(state),
  });
  const replacesId = replacesIdFor(state);
  const isCreating = state.mode === "create";

  useEffect(() => {
    if (!isCreating) return undefined;
    const subscription = watch((values, change) => {
      if (change.name !== "name" || formState.dirtyFields.id) return;
      setValue("id", idFromName(values.name ?? ""));
    });
    return () => subscription.unsubscribe();
  }, [isCreating, watch, setValue, formState.dirtyFields.id]);

  const submit = handleSubmit(async (values) => {
    const result = await saveEmployee(toEmployeeFields(values), replacesId);
    if (result.ok) onSaved(result.id, replacesId);
    else setError("root", { message: result.message });
  });

  return (
    <Sheet open onOpenChange={(isOpen) => { if (!isOpen && !formState.isSubmitting) onClose(); }}>
      <SheetContent
        side="right"
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-3xl border border-white/10 bg-card p-0 shadow-2xl backdrop-blur-2xl sm:w-[560px] sm:max-w-none"
        closeButtonClassName="top-5 right-5"
      >
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="flex items-center px-7 pt-5 pb-2">
            <SheetTitle className="text-sm font-normal text-foreground">{DIALOG_TITLES[state.mode]}</SheetTitle>
          </div>
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-7 pb-5">
            <IdentityFields register={register} errors={formState.errors} isIdLocked={state.mode === "customize"} />
            <PermissionFields register={register} control={control} />
            <PolicyFields register={register} control={control} />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border/40 px-7 pt-3 pb-6">
            {formState.errors.root?.message && (
              <p role="alert" className="mr-auto max-h-24 overflow-y-auto text-destructive text-xs">{formState.errors.root.message}</p>
            )}
            <Button type="button" variant="ghost" size="sm" disabled={formState.isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={formState.isSubmitting} className="rounded-full px-5">
              {formState.isSubmitting ? "Saving…" : isCreating || state.mode === "duplicate" ? "Create employee" : "Save"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
