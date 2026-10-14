import type { ReactNode } from "react";
import { useId } from "react";
import { LABEL } from "@/features/projects/components";
import { Checkbox } from "@/shared/ui";

export const CHIP_ON = "border-primary bg-primary/15 text-foreground";
export const CHIP_OFF = "border-border/60 text-muted-foreground hover:border-white/15 hover:text-foreground";
export const SELECTED_CHIP = "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-primary/25";
export const CHOICE_CARD = "flex cursor-pointer select-none items-start gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 transition-colors hover:border-white/10 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/10";

export function ChoiceFrame({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: ReactNode }) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} className="space-y-2">
      <p id={labelId} className={LABEL}>{label}</p>
      {children}
      {hint ? <p id={hintId} className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function clickedCheckbox(target: EventTarget): boolean {
  return target instanceof Element && target.closest("[data-slot=checkbox]") !== null;
}

export function ChoiceCard({ isOn, onToggle, label, detail, aside }: { readonly isOn: boolean; readonly onToggle: () => void; readonly label: string; readonly detail?: string; readonly aside?: ReactNode }) {
  return (
    <div className={CHOICE_CARD} onClick={(event) => { if (clickedCheckbox(event.target)) return; onToggle(); }}>
      <Checkbox className="mt-0.5" checked={isOn} onCheckedChange={onToggle} aria-label={label} />
      <span className="min-w-0 flex-1">
        <span className="block text-foreground text-sm">{label}</span>
        {detail ? <span className="block text-muted-foreground text-xs">{detail}</span> : null}
      </span>
      {aside}
    </div>
  );
}
