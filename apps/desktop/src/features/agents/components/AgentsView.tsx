import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { PlusIcon } from "lucide-react";
import { useHomeWidgetStore } from "@/home/canvas/stores";
import { useAgents, type Agent, type AgentDraft } from "@/features/agents/hooks";
import { AgentCard } from "./AgentCard";
import { AgentDetailView } from "./AgentDetailView";
import { AgentDialog } from "./AgentDialog";

export function AgentsView({
  onChat,
  engines,
}: {
  /** Start a chat as this agent, optionally pre-filling the composer. */
  onChat: (agent: Agent, message?: string) => void;
  engines: { id: string; label: string; installed: boolean }[];
}) {
  const { agents, create, update, remove, duplicate, resetBuiltin, isBuiltinModified } =
    useAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? agents.find((agent) => agent.id === viewingId) ?? null : null;

  // "Add to home" pins the agent as a widget on the Home canvas. The canvas
  // store is normally initialised by HomeView; do it here too so the action
  // works even if Home hasn't been opened this session.
  const initHome = useHomeWidgetStore((s) => s.initialize);
  const homeInstances = useHomeWidgetStore((s) => s.instances);
  const addWidget = useHomeWidgetStore((s) => s.addWidget);
  const removeWidget = useHomeWidgetStore((s) => s.removeWidget);
  useEffect(() => {
    void initHome();
  }, [initHome]);

  const pinById = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of homeInstances) {
      if (inst.type === "agentPin" && typeof inst.state?.agentId === "string") {
        map.set(inst.state.agentId as string, inst.id);
      }
    }
    return map;
  }, [homeInstances]);

  const toggleHome = (agentId: string) => {
    const existingWidgetId = pinById.get(agentId);
    if (existingWidgetId) {
      removeWidget(existingWidgetId);
      return;
    }
    // Scatter around the canvas origin so repeated adds don't stack exactly.
    addWidget(
      "agentPin",
      (Math.random() - 0.5) * 260,
      (Math.random() - 0.5) * 220,
      { agentId },
    );
  };

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

  const dialog = (
    <AgentDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      editing={editing}
      onSubmit={handleSubmit}
      engines={engines}
    />
  );

  if (viewing) {
    return (
      <>
        <AgentDetailView
          agent={viewing}
          isPinned={pinById.has(viewing.id)}
          onBack={() => setViewingId(null)}
          onChat={(message) => onChat(viewing, message)}
          onEdit={() => openEdit(viewing)}
          onTogglePin={() => toggleHome(viewing.id)}
          onDuplicate={() => duplicate(viewing.id)}
          onDelete={() => {
            remove(viewing.id);
            setViewingId(null);
          }}
          onReset={
            viewing.builtin && isBuiltinModified(viewing.id)
              ? () => resetBuiltin(viewing.id)
              : undefined
          }
        />
        {dialog}
      </>
    );
  }

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
              onView={() => setViewingId(agent.id)}
              onChat={() => onChat(agent)}
              onEdit={() => openEdit(agent)}
              onDuplicate={() => duplicate(agent.id)}
              onDelete={() => remove(agent.id)}
              onHome={pinById.has(agent.id)}
              onToggleHome={() => toggleHome(agent.id)}
              onReset={
                agent.builtin && isBuiltinModified(agent.id)
                  ? () => resetBuiltin(agent.id)
                  : undefined
              }
            />
          </motion.div>
        ))}
      </div>

      {dialog}
    </div>
  );
}
