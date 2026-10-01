import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useAgents, useHomePins, type Agent } from "@/features/agents/hooks";
import type { PersonaDraft } from "@/features/agents/personas";
import type { CardAction } from "@/features/agents/lib";
import { ConfirmDialog } from "@/shared/ui";
import { EmployeeCard } from "../employees";
import { PersonaDialog } from "./PersonaDialog";

interface PersonasViewProps {
  readonly onChat: (agent: Agent) => void;
}

export function PersonasView({ onChat }: PersonasViewProps) {
  const { agents, removePersona, savePersona } = useAgents();
  const { isPinned, togglePin } = useHomePins();
  const personas = agents.filter((agent) => agent.origin.kind === "persona");
  const [editing, setEditing] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);

  const handleAction = (action: CardAction, agentId: string) => {
    const agent = personas.find((item) => item.id === agentId);
    if (!agent) return;
    if (action === "chat") onChat(agent);
    else if (action === "edit") setEditing(agent);
    else if (action === "toggle-home") togglePin(agentId);
    else if (action === "delete") setPendingDelete(agent);
  };

  const save = (draft: PersonaDraft, existingId: string | null) => savePersona(draft, existingId);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-8">
      <header className="mb-8">
        <h1 className="font-medium text-lg text-foreground">Personas</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          How the agent works on a task. Builder, Teacher, Committer, and Debugger decide how Codex, Grok, and the other engines reply, edit, and commit. Chat with one, or @-mention it.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,15rem))] xl:justify-start">
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          aria-label="New persona"
          className="flex aspect-square w-full items-center justify-center rounded-xl border border-border/50 border-dashed text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <PlusIcon className="size-8 stroke-[1.25]" />
        </button>
        {personas.map((agent) => (
          <EmployeeCard key={agent.id} agent={agent} entry={undefined} isPinned={isPinned(agent.id)} onAction={handleAction} />
        ))}
      </div>
      {(isCreating || editing) && (
        <PersonaDialog initial={editing} onClose={() => { setIsCreating(false); setEditing(null); }} onSave={save} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(isOpen) => { if (!isOpen) setPendingDelete(null); }}
          title={`Delete ${pendingDelete.name}?`}
          description="This persona is removed from this computer. Built-in work styles stay."
          cancelLabel="Cancel"
          confirmLabel="Delete"
          loadingLabel="Working…"
          isLoading={false}
          onConfirm={() => {
            removePersona(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
