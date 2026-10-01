import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useAgents, useHomePins, type Agent } from "@/features/agents/hooks";
import type { PersonaDraft } from "@/features/agents/personas";
import { takenAvatarKeys, type CardAction } from "@/features/agents/lib";
import { ConfirmDialog } from "@/shared/ui";
import { EmployeeCard } from "../employees";
import { PersonaEditor } from "./PersonaEditor";

interface PersonasViewProps {
  readonly onChat: (agent: Agent) => void;
}

export function PersonasView({ onChat }: PersonasViewProps) {
  const { agents, removePersona, savePersona } = useAgents();
  const { isPinned, togglePin } = useHomePins();
  const personas = agents.filter((agent) => agent.origin.kind === "persona");
  const [editing, setEditing] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ readonly agent: Agent; readonly action: "delete" | "reset" } | null>(null);

  const handleAction = (action: CardAction, agentId: string) => {
    const agent = personas.find((item) => item.id === agentId);
    if (!agent) return;
    switch (action) {
      case "chat":
        onChat(agent);
        return;
      case "edit":
      case "customize":
        setEditing(agent);
        return;
      case "toggle-home":
        togglePin(agentId);
        return;
      case "delete":
      case "reset":
        setPendingRemoval({ agent, action });
        return;
      case "view":
      case "duplicate":
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  };

  const save = (draft: PersonaDraft, existingId: string | null) => savePersona(draft, existingId);

  const roster = (
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
        {pendingRemoval && (
          <ConfirmDialog
            open
            onOpenChange={(isOpen) => { if (!isOpen) setPendingRemoval(null); }}
            title={pendingRemoval.action === "reset" ? `Reset ${pendingRemoval.agent.name}?` : `Delete ${pendingRemoval.agent.name}?`}
            description={pendingRemoval.action === "reset"
              ? "Your changes are removed and the built-in persona comes back."
              : "This persona is removed from this computer. Built-in work styles stay."}
            cancelLabel="Cancel"
            confirmLabel={pendingRemoval.action === "reset" ? "Reset" : "Delete"}
            loadingLabel="Working…"
            isLoading={false}
            onConfirm={() => {
              removePersona(pendingRemoval.agent.id);
              setPendingRemoval(null);
            }}
          />
        )}
      </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {isCreating || editing ? (
        <PersonaEditor
          initial={editing}
          takenKeys={takenAvatarKeys(agents, editing?.id ?? null)}
          onClose={() => { setIsCreating(false); setEditing(null); }}
          onSave={save}
        >
          {roster}
        </PersonaEditor>
      ) : (
        roster
      )}
    </div>
  );
}
