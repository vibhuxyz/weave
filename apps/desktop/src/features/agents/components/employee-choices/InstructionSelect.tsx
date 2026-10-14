import { useState } from "react";
import { Controller, type Control } from "react-hook-form";
import type { EmployeeFormValues } from "@/features/employees";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui";
import { ChoiceFrame } from "./ChoiceFrame";
import { CUSTOM_INSTRUCTIONS_ID, INSTRUCTION_PRESETS, instructionPresetId } from "./catalog";

export function InstructionSelect({ control }: { readonly control: Control<EmployeeFormValues> }) {
  return (
    <Controller
      control={control}
      name="instructions"
      render={({ field }) => (
        <ChoiceFrame label="Instructions" hint="Markdown given to the employee on every task. Pick a preset, or Custom to write your own.">
          <InstructionBody value={field.value} onChange={field.onChange} />
        </ChoiceFrame>
      )}
    />
  );
}

function InstructionBody({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }) {
  const matchedId = instructionPresetId(value);
  const [forcedCustom, setForcedCustom] = useState(false);
  const [trackedMatch, setTrackedMatch] = useState(matchedId);
  if (trackedMatch !== matchedId) {
    setTrackedMatch(matchedId);
    if (forcedCustom) setForcedCustom(false);
  }
  const isCustom = forcedCustom || (matchedId === null && value.trim() !== "");
  return (
    <div className="space-y-2">
      <InstructionMenu value={isCustom ? CUSTOM_INSTRUCTIONS_ID : matchedId} onPick={(id) => pickInstruction(id, value, onChange, setForcedCustom)} />
      {isCustom ? <InstructionEditor value={value} onChange={onChange} /> : <InstructionPreview presetId={matchedId} />}
    </div>
  );
}

function pickInstruction(id: string, value: string, onChange: (next: string) => void, setForcedCustom: (next: boolean) => void): void {
  if (id === CUSTOM_INSTRUCTIONS_ID) {
    setForcedCustom(true);
    return;
  }
  const preset = INSTRUCTION_PRESETS.find((item) => item.id === id);
  if (!preset) return;
  setForcedCustom(false);
  if (preset.body !== value) onChange(preset.body);
}

function InstructionMenu({ value, onPick }: { readonly value: string | null; readonly onPick: (id: string) => void }) {
  return (
    <Select value={value ?? undefined} onValueChange={onPick}>
      <SelectTrigger className={cn(FIELD, "h-11 w-full rounded-xl")}>
        <SelectValue placeholder="Choose instructions" />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {INSTRUCTION_PRESETS.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>)}
        <SelectItem value={CUSTOM_INSTRUCTIONS_ID}>Custom instructions</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InstructionPreview({ presetId }: { readonly presetId: string | null }) {
  const preset = INSTRUCTION_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  return <pre className="max-h-28 overflow-y-auto rounded-xl border border-white/5 bg-black/20 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{preset.body}</pre>;
}

function InstructionEditor({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={8} className={cn(FIELD, "resize-y py-3 font-mono text-xs leading-relaxed")} aria-label="Custom instructions" />;
}
