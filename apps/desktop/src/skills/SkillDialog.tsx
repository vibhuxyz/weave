import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import { FIELD, LABEL } from "../CreateProjectDialog";
import type { SkillPlugin, SkillPluginDraft } from "../useSkillPlugins";

export function SkillDialog({
  open: isOpen,
  onOpenChange,
  editing,
  onSubmit,
  projectDir,
  projectLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An existing plugin to edit, or null to create. */
  editing: SkillPlugin | null;
  onSubmit: (draft: SkillPluginDraft, editingId: string | null) => void;
  /** The active project, so "This project only" has somewhere to scope to. */
  projectDir: string | undefined;
  projectLabel: string | undefined;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<"always" | "project">("always");

  useEffect(() => {
    if (!isOpen) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setUrl(editing?.url ?? "");
    setScope(editing?.scope === "project" && projectDir ? "project" : editing?.scope ?? "always");
  }, [isOpen, editing, projectDir]);

  const canSave = name.trim().length > 0 && description.trim().length > 0;

  const searchGoogle = () => {
    const q = encodeURIComponent(`${name || "plugin"} claude code plugin`);
    void openUrl(`https://www.google.com/search?q=${q}`);
  };

  const submit = () => {
    if (!canSave) return;
    onSubmit(
      {
        name: name.trim(),
        description: description.trim(),
        url: url.trim() || undefined,
        scope,
        projectDir: scope === "project" ? projectDir : undefined,
      },
      editing?.id ?? null,
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-3xl border border-white/10 bg-card p-0 shadow-[0_22px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:w-[480px] sm:max-w-none"
        closeButtonClassName="top-5 right-5"
      >
        <div className="flex items-center px-7 pt-5 pb-2">
          <SheetTitle className="text-sm font-normal text-foreground">
            {editing ? "Edit plugin" : "Add a plugin"}
          </SheetTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5 pt-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Point the agent at a plugin, MCP server, or style guide from a
            provider's official page — for better coding, UI, or whatever the
            task needs.
          </p>

          <div className="space-y-2">
            <p className={LABEL}>
              Name <span className="text-destructive">*</span>
            </p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. shadcn/ui MCP server"
                className={cn(FIELD, "h-11")}
              />
              <Button
                type="button"
                variant="subtle"
                size="icon-lg"
                className="shrink-0 rounded-xl"
                title="Search Google for this plugin"
                aria-label="Search Google for this plugin"
                onClick={searchGoogle}
              >
                <SearchIcon />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className={LABEL}>
              What it's for <span className="text-destructive">*</span>
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should the agent use this for, and when?"
              rows={4}
              className={cn(FIELD, "resize-none py-3 leading-relaxed")}
            />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Official page</p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={cn(FIELD, "h-11")}
            />
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Enable</p>
            <Select value={scope} onValueChange={(v) => setScope(v as "always" | "project")}>
              <SelectTrigger className={cn(FIELD, "h-11")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always, in every project</SelectItem>
                <SelectItem value="project" disabled={!projectDir}>
                  {projectDir ? `This project only (${projectLabel})` : "This project only (open a project first)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 px-7 pt-2 pb-6">
          {!canSave && (
            <p aria-live="polite" className="mr-auto text-muted-foreground text-xs">
              Required: name, what it's for.
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
            {editing ? "Save changes" : "Add plugin"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
