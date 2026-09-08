import { useState } from "react";
import { motion } from "motion/react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  useSkillPlugins,
  type SkillPlugin,
  type SkillPluginDraft,
} from "../useSkillPlugins";
import { SkillDialog } from "./SkillDialog";

export function SkillsView({
  projectDir,
  projectLabel,
}: {
  /** The active project, so plugins can be scoped to it. */
  projectDir: string | undefined;
  projectLabel: string | undefined;
}) {
  const { plugins, create, update, remove } = useSkillPlugins();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SkillPlugin | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (plugin: SkillPlugin) => {
    setEditing(plugin);
    setDialogOpen(true);
  };
  const handleSubmit = (draft: SkillPluginDraft, editingId: string | null) => {
    if (editingId) update(editingId, draft);
    else create(draft);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden p-8">
      <h1 className="mb-1 font-medium text-lg text-foreground">Skills</h1>
      <p className="mb-8 text-muted-foreground text-sm">
        Plugins from a provider's official page — MCP servers, style guides,
        anything that gets better coding or UI out of the agent.
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {plugins.length === 0 && (
          <p className="rounded-xl border border-border/50 border-dashed p-6 text-center text-muted-foreground text-sm">
            No plugins yet. Add one below.
          </p>
        )}
        {plugins.map((plugin, i) => (
          <motion.div
            key={plugin.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.03, ease: [0.16, 1, 0.3, 1] }}
          >
            <PluginRow
              plugin={plugin}
              projectLabel={projectLabel}
              onEdit={() => openEdit(plugin)}
              onDelete={() => remove(plugin.id)}
            />
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex shrink-0 justify-center border-border/50 border-t pt-6">
        <Button
          type="button"
          variant="subtle"
          size="sm"
          className="rounded-full px-5"
          leftIcon={<PlusIcon />}
          onClick={openCreate}
        >
          Add a plugin
        </Button>
      </div>

      <SkillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={handleSubmit}
        projectDir={projectDir}
        projectLabel={projectLabel}
      />
    </div>
  );
}

function PluginRow({
  plugin,
  projectLabel,
  onEdit,
  onDelete,
}: {
  plugin: SkillPlugin;
  projectLabel: string | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border/50 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-sm text-foreground">{plugin.name}</p>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground",
              "bg-secondary/60",
            )}
          >
            {plugin.scope === "always" ? "Always" : projectLabel ?? "This project"}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
          {plugin.description}
        </p>
        {plugin.url && (
          <button
            type="button"
            onClick={() => void openUrl(plugin.url!)}
            className="mt-1 truncate text-agent-accent text-xs hover:underline"
          >
            {plugin.url}
          </button>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
              "focus-visible:opacity-100 data-[state=open]:opacity-100",
            )}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-3.5" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
