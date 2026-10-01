import { FIELD, LABEL } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Button, Sheet, SheetContent, SheetTitle } from "@/shared/ui";
import { PersonaAvatarButton } from "./PersonaAvatarButton";

interface PersonaDialogProps {
  readonly title: string;
  readonly submitLabel: string;
  readonly nameLocked: boolean;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly character: string;
  readonly error: string | null;
  readonly onName: (value: string) => void;
  readonly onDescription: (value: string) => void;
  readonly onInstructions: (value: string) => void;
  readonly onSelectAvatar: () => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
}

const INPUT = cn(FIELD, "h-11");

export function PersonaDialog({
  title,
  submitLabel,
  nameLocked,
  name,
  description,
  instructions,
  character,
  error,
  onName,
  onDescription,
  onInstructions,
  onSelectAvatar,
  onClose,
  onSubmit,
}: PersonaDialogProps) {
  const canSave = name.trim().length > 0 && description.trim().length > 0 && instructions.trim().length > 0;

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
            onSubmit();
          }}
        >
          <div className="px-7 pt-5 pb-2">
            <SheetTitle className="text-sm font-normal text-foreground">{title}</SheetTitle>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5">
            <PersonaAvatarButton name={name} character={character} onSelect={onSelectAvatar} />
            <div className="space-y-2">
              <label htmlFor="persona-name" className={LABEL}>Name</label>
              <input
                id="persona-name"
                value={name}
                readOnly={nameLocked}
                onChange={(event) => onName(event.target.value)}
                placeholder="e.g. Code Reviewer"
                className={cn(INPUT, nameLocked && "text-muted-foreground")}
              />
              {nameLocked && (
                <p className="text-muted-foreground text-xs">This name stays, so your version replaces the built-in persona.</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="persona-description" className={LABEL}>Description</label>
              <input id="persona-description" value={description} onChange={(event) => onDescription(event.target.value)} placeholder="A short line about what this persona does" className={INPUT} />
            </div>
            <div className="space-y-2">
              <label htmlFor="persona-instructions" className={LABEL}>Instructions</label>
              <textarea id="persona-instructions" value={instructions} onChange={(event) => onInstructions(event.target.value)} rows={8} placeholder="Review the diff, name the risk, and do not rewrite the feature." className={cn(FIELD, "resize-y py-3 leading-relaxed")} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border/40 px-7 pt-3 pb-6">
            {error && <p role="alert" className="mr-auto text-destructive text-xs">{error}</p>}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!canSave} className="rounded-full px-5">{submitLabel}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
