import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BoxIcon, UploadIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import { ENGINES, DEFAULT_ENGINE_ID } from "@weave/agent/engines-registry.ts";
import {
  FIELD,
  LABEL,
  SwatchPill,
  toneColor,
  type ProjectTone,
} from "../CreateProjectDialog";
import { AgentAvatar } from "./AgentAvatar";
import type { Agent, AgentDraft } from "../useAgents";

export function AgentDialog({
  open: isOpen,
  onOpenChange,
  editing,
  onSubmit,
  engines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An existing agent to edit, or null to create. */
  editing: Agent | null;
  onSubmit: (draft: AgentDraft, editingId: string | null) => void;
  /** Installed engines from the running server; empty until connected. */
  engines: { id: string; label: string; installed: boolean }[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [engineId, setEngineId] = useState(DEFAULT_ENGINE_ID);
  const [model, setModel] = useState("");
  const [tone, setTone] = useState<ProjectTone>("blue");
  const [icon, setIcon] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const tint = toneColor(tone)!;

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setInstructions(editing?.instructions ?? "");
    setEngineId(editing?.engineId ?? DEFAULT_ENGINE_ID);
    setModel(editing?.model ?? "");
    setTone(editing?.tint ?? "blue");
    setIcon(editing?.icon);
  }, [isOpen, editing]);

  const pickIcon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setIcon(String(reader.result));
    reader.readAsDataURL(file);
  };

  // Only installed engines, plus the currently-selected one if it's set on an
  // existing agent (so editing never silently drops it). Fall back to the full
  // list before the server has reported (engines empty).
  const providerOptions =
    engines.length === 0
      ? Object.values(ENGINES).map((e) => ({ id: e.id, label: e.label }))
      : engines
          .filter((e) => e.installed || e.id === engineId)
          .map((e) => ({ id: e.id, label: e.label }));

  const canSave = name.trim().length > 0 && instructions.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSubmit(
      {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        engineId,
        model: model.trim() || undefined,
        tint: tone,
        icon,
      },
      editing?.id ?? null,
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={
          {
            "--project-tint": tint,
            backgroundColor: `color-mix(in oklch, ${tint} 11%, var(--card))`,
          } as CSSProperties
        }
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-3xl border border-white/10 p-0 shadow-[0_22px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-colors duration-500 sm:w-[520px] sm:max-w-none"
        closeButtonClassName="top-5 right-5"
      >
        <div className="flex items-center px-7 pt-5 pb-2">
          <SheetTitle className="text-sm font-normal text-foreground">
            {editing ? "Edit agent" : "New agent"}
          </SheetTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5">
          <div className="relative flex h-[240px] flex-col items-center justify-center gap-6">
            <AgentAvatar name={name || "Agent"} tint={tone} icon={icon} size="xl" />
            <SwatchPill tone={tone} onChange={setTone} />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Icon</p>
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {icon ? (
                  <img src={icon} alt="" className="size-full object-cover" />
                ) : (
                  <BoxIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                className="rounded-xl"
                leftIcon={<UploadIcon className="size-3.5" />}
                onClick={() => fileRef.current?.click()}
              >
                Upload
              </Button>
              {icon && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setIcon(undefined)}
                >
                  Clear
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickIcon(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className={LABEL}>
              Agent Name <span className="text-destructive">*</span>
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Reviewer"
              className={cn(FIELD, "h-11")}
            />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Description</p>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short line about what this agent does"
              className={cn(FIELD, "h-11")}
            />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Provider</p>
            <Select value={engineId} onValueChange={setEngineId}>
              <SelectTrigger className={cn(FIELD, "h-11")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Model</p>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="leave blank to pick in chat"
              className={cn(FIELD, "h-11")}
            />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>
              Agent instructions <span className="text-destructive">*</span>
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="You are …  Describe how this agent should behave."
              rows={8}
              className={cn(FIELD, "resize-none py-3 leading-relaxed font-mono text-xs")}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 px-7 pt-2 pb-6">
          {!canSave && (
            <p aria-live="polite" className="mr-auto text-muted-foreground text-xs">
              Required: name, instructions.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={submit}
            className="rounded-full px-5"
          >
            {editing ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
