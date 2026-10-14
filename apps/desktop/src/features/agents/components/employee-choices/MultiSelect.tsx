import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Controller, type Control } from "react-hook-form";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { ChoiceFrame, CHIP_OFF, CHIP_ON, SELECTED_CHIP } from "./ChoiceFrame";
import { optionsWithExtras, selectionSummary, toggleLine, type Choice } from "./catalog";

interface MultiSelectProps {
  readonly control: Control<EmployeeFormValues>;
  readonly name: "responsibilities" | "readPaths" | "writePaths" | "capabilities";
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly Choice[];
  readonly placeholder?: string;
  readonly variant: "menu" | "chips";
}

function useDismiss(rootRef: RefObject<HTMLDivElement | null>, isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, onClose, rootRef]);
}

export function MultiSelect({ control, name, label, hint, options, placeholder, variant }: MultiSelectProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChoiceFrame label={label} hint={hint}>
          <LineChoices text={field.value} options={options} placeholder={placeholder} variant={variant} onChange={field.onChange} />
        </ChoiceFrame>
      )}
    />
  );
}

function LineChoices({ text, options, placeholder, variant, onChange }: { readonly text: string; readonly options: readonly Choice[]; readonly placeholder?: string; readonly variant: "menu" | "chips"; readonly onChange: (next: string) => void }) {
  if (variant === "chips") return <ChipChoices text={text} options={options} onChange={onChange} />;
  return <MenuChoices text={text} options={options} placeholder={placeholder ?? "Choose"} onChange={onChange} />;
}

function ChipChoices({ text, options, onChange }: { readonly text: string; readonly options: readonly Choice[]; readonly onChange: (next: string) => void }) {
  const choices = optionsWithExtras(options, text);
  const selected = new Set(linesOf(text));
  return (
    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
      {choices.map((choice) => {
        const isOn = selected.has(choice.value);
        return (
          <button key={choice.value} type="button" aria-pressed={isOn} onClick={() => onChange(toggleLine(text, choice.value))} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", isOn ? CHIP_ON : CHIP_OFF)}>
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function MenuChoices({ text, options, placeholder, onChange }: { readonly text: string; readonly options: readonly Choice[]; readonly placeholder: string; readonly onChange: (next: string) => void }) {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, isOpen, close);
  const choices = optionsWithExtras(options, text);
  const selected = linesOf(text);
  const summary = selectionSummary(choices, selected, placeholder);
  const change = (value: string) => onChange(toggleLine(text, value));
  return (
    <div ref={rootRef} className="space-y-2" onKeyDown={(event) => { if (event.key !== "Escape") return; event.stopPropagation(); setOpen(false); }}>
      <MenuTrigger isOpen={isOpen} label={summary.label} isEmpty={summary.isEmpty} onToggle={() => setOpen((open) => !open)} />
      {isOpen ? <OptionPanel choices={choices} selected={new Set(selected)} onToggle={change} /> : null}
      <SelectedChips choices={choices} selected={selected} onRemove={change} />
    </div>
  );
}

function MenuTrigger({ isOpen, label, isEmpty, onToggle }: { readonly isOpen: boolean; readonly label: string; readonly isEmpty: boolean; readonly onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={isOpen} onClick={onToggle} className={cn(FIELD, "flex h-11 w-full items-center justify-between gap-3 text-left")}>
      <span className={cn("truncate", isEmpty && "text-muted-foreground/50")}>{label}</span>
      <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
    </button>
  );
}

function OptionPanel({ choices, selected, onToggle }: { readonly choices: readonly Choice[]; readonly selected: ReadonlySet<string>; readonly onToggle: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? choices : choices.filter((choice) => choice.label.toLowerCase().includes(needle) || choice.value.toLowerCase().includes(needle));
  return (
    <div className="space-y-1 rounded-xl border border-white/10 bg-popover p-1.5 shadow-popover">
      <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Search" aria-label="Search choices" className={cn(FIELD, "h-9")} autoFocus />
      <div className="max-h-60 space-y-0.5 overflow-y-auto">
        {shown.length === 0 ? <p className="px-2 py-3 text-muted-foreground text-xs">No matches.</p> : null}
        {shown.map((choice) => <OptionRow key={choice.value} choice={choice} isOn={selected.has(choice.value)} onToggle={onToggle} />)}
      </div>
    </div>
  );
}

function OptionRow({ choice, isOn, onToggle }: { readonly choice: Choice; readonly isOn: boolean; readonly onToggle: (value: string) => void }) {
  return (
    <button type="button" aria-pressed={isOn} onClick={() => onToggle(choice.value)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60", isOn && "bg-primary/10")}>
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", isOn ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden>
        {isOn ? <CheckIcon className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{choice.label}</span>
        {choice.label !== choice.value ? <span className="block truncate text-muted-foreground text-xs">{choice.value}</span> : null}
      </span>
    </button>
  );
}

function SelectedChips({ choices, selected, onRemove }: { readonly choices: readonly Choice[]; readonly selected: readonly string[]; readonly onRemove: (value: string) => void }) {
  if (selected.length === 0) return null;
  const labelsByValue = new Map(choices.map((choice) => [choice.value, choice.label]));
  return (
    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
      {selected.map((value) => <SelectedChip key={value} label={labelsByValue.get(value) ?? value} onRemove={() => onRemove(value)} />)}
    </div>
  );
}

function SelectedChip({ label, onRemove }: { readonly label: string; readonly onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className={SELECTED_CHIP} aria-label={`Remove ${label}`}>
      <span>{label}</span>
      <XIcon className="size-3 opacity-60" />
    </button>
  );
}
