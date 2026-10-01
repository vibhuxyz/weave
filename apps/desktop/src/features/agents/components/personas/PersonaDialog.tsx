import { useState } from "react";
import type { Agent } from "@/features/agents/hooks";
import type { PersonaDraft } from "@/features/agents/personas";
import { FIELD, LABEL } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Button, Sheet, SheetContent, SheetTitle } from "@/shared/ui";

interface PersonaDialogProps {
  readonly initial: Agent | null;
  readonly onClose: () => void;
  readonly onSave: (draft: PersonaDraft, existingId: string | null) => { ok: true; id: string } | { ok: false; message: string };
}

export function PersonaDialog({ initial, onClose, onSave }: PersonaDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = onSave({ name, description, instructions }, initial?.id ?? null);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <Sheet open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-3xl border border-white/10 bg-card p-0 shadow-2xl backdrop-blur-2xl sm:w-[560px] sm:max-w-none"
        closeButtonClassName="top-5 right-5"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="px-7 pt-5 pb-2">
            <SheetTitle className="text-sm font-normal text-foreground">{initial ? "Edit persona" : "New persona"}</SheetTitle>
            <p className="mt-1 text-muted-foreground text-xs">A persona decides how Codex, Grok, and the other engines work and reply.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5">
            <div className="space-y-2">
              <label htmlFor="persona-name" className={LABEL}>Name</label>
              <input id="persona-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Reviewer" className={cn(FIELD, "h-11")} />
            </div>
            <div className="space-y-2">
              <label htmlFor="persona-description" className={LABEL}>Description</label>
              <input id="persona-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What kind of task this persona is for" className={cn(FIELD, "h-11")} />
            </div>
            <div className="space-y-2">
              <label htmlFor="persona-instructions" className={LABEL}>How the agent works</label>
              <textarea id="persona-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={8} placeholder="Review the diff, name the risk, and do not rewrite the feature." className={cn(FIELD, "resize-y py-3 leading-relaxed")} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border/40 px-7 pt-3 pb-6">
            {error && <p role="alert" className="mr-auto text-destructive text-xs">{error}</p>}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" className="rounded-full px-5">{initial ? "Save" : "Create persona"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
