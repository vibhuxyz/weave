import { useState } from "react";
import { motion } from "motion/react";
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { AgentTileButton } from "@/shared/ui/agent-tile-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useAgents, type Agent, type AgentDraft } from "../useAgents";
import { AgentAvatar } from "./AgentAvatar";
import { AgentDialog } from "./AgentDialog";

export function AgentsView({
  onChat,
  engines,
}: {
  /** Start a chat as this agent. */
  onChat: (agent: Agent) => void;
  engines: { id: string; label: string; installed: boolean }[];
}) {
  const { agents, create, update, remove, duplicate } = useAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setDialogOpen(true);
  };
  const handleSubmit = (draft: AgentDraft, editingId: string | null) => {
    if (editingId) update(editingId, draft);
    else create(draft);
  };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-8">
      <h1 className="mb-8 font-medium text-lg text-foreground">Agents</h1>

      <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,15rem))] xl:justify-start">
        {/* Create tile */}
        <button
          type="button"
          onClick={openCreate}
          className="flex aspect-square w-full items-center justify-center rounded-xl border border-border/50 border-dashed text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <PlusIcon className="size-8 stroke-[1.25]" />
        </button>

        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.24,
              delay: Math.min(i, 6) * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <AgentCard
              agent={agent}
              onView={() => openEdit(agent)}
              onChat={() => onChat(agent)}
              onEdit={() => openEdit(agent)}
              onDuplicate={() => duplicate(agent.id)}
              onDelete={() => remove(agent.id)}
            />
          </motion.div>
        ))}
      </div>

      <AgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={handleSubmit}
        engines={engines}
      />
    </div>
  );
}

function AgentCard({
  agent,
  onView,
  onChat,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  agent: Agent;
  onView: () => void;
  onChat: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex w-full flex-col gap-3 rounded-xl p-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg">
        <AgentAvatar
          name={agent.name}
          seed={agent.id}
          tint={agent.tint}
          icon={agent.icon}
          size="lg"
          className="transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
          <AgentTileButton
            size="sm"
            className="pointer-events-auto"
            onClick={onView}
          >
            View
          </AgentTileButton>
          <AgentTileButton
            size="sm"
            className="pointer-events-auto"
            onClick={onChat}
          >
            Chat
          </AgentTileButton>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-foreground">
            {agent.name}
          </p>
          <p className="mt-1 line-clamp-3 max-w-[28ch] text-muted-foreground text-xs leading-relaxed">
            {agent.description || agent.instructions}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AgentTileButton
              size="icon-xs"
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100 data-[state=open]:opacity-100",
              )}
            >
              <MoreHorizontalIcon className="size-3.5" />
            </AgentTileButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <CopyIcon className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            {!agent.builtin && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon className="size-3.5" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
