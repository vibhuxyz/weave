import { useCallback, useMemo, useState } from "react";
import { useEmployeeListing, type Employee, type EmployeeActions, type EmployeeEntry } from "@/features/employees";
import type { CardAction } from "@/features/agents/lib";
import { useHomePins } from "./use-home-pins";
import { useAgents, type Agent } from "./useAgents";

export type EmployeeDialogState =
  | { readonly mode: "create" }
  | { readonly mode: "edit" | "customize" | "duplicate"; readonly employee: Employee };

export interface PendingRemoval {
  readonly agent: Agent;
  readonly action: "reset" | "delete";
}

interface EmployeesPageOptions {
  readonly actions: EmployeeActions;
  readonly onChat: (agent: Agent, message?: string) => void;
  readonly focusEmployeeId: string | null;
  readonly onFocusHandled: () => void;
}

function entriesByIdOf(entries: readonly EmployeeEntry[]): ReadonlyMap<string, EmployeeEntry> {
  return new Map(entries.map((entry) => [entry.employee.id, entry]));
}

export function useEmployeesPage({ actions, onChat, focusEmployeeId, onFocusHandled }: EmployeesPageOptions) {
  const listing = useEmployeeListing();
  const { agents, removePersona } = useAgents();
  const { isPinned, togglePin } = useHomePins();
  const [viewingId, setViewingId] = useState<string | null>(focusEmployeeId);
  const [dialog, setDialog] = useState<EmployeeDialogState | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const entriesById = useMemo(() => entriesByIdOf(listing.status === "ready" ? listing.entries : []), [listing]);
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const viewingAgent = viewingId ? agentsById.get(viewingId) : undefined;

  const handleAction = useCallback((action: CardAction, agentId: string) => {
    const agent = agentsById.get(agentId);
    const entry = entriesById.get(agentId);
    if (!agent) return;
    switch (action) {
      case "view":
        setViewingId(agentId);
        return;
      case "chat":
        onChat(agent);
        return;
      case "edit":
      case "customize":
      case "duplicate":
        if (entry) setDialog({ mode: action, employee: entry.employee });
        return;
      case "toggle-home":
        togglePin(agentId);
        return;
      case "reset":
      case "delete":
        setPendingRemoval({ agent, action });
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }, [agentsById, entriesById, onChat, togglePin]);

  const confirmRemoval = useCallback(async (removal: PendingRemoval) => {
    const { agent, action } = removal;
    if (agent.origin.kind === "persona") {
      removePersona(agent.id);
      setPendingRemoval(null);
      return;
    }
    setIsRemoving(true);
    const result = await actions.deleteEmployee(agent.id);
    setIsRemoving(false);
    setPendingRemoval(null);
    if (!result.ok) setActionError(result.message);
    else if (action === "delete") setViewingId((current) => (current === agent.id ? null : current));
  }, [actions, removePersona]);

  const handleSaved = useCallback((id: string, replacedId: string | null) => {
    setDialog(null);
    setViewingId((current) => (current !== null && current === replacedId ? id : current));
  }, []);

  return {
    listing,
    agents,
    entriesById,
    viewing: viewingAgent ? { agent: viewingAgent, entry: entriesById.get(viewingAgent.id) } : null,
    closeViewing: () => {
      setViewingId(null);
      onFocusHandled();
    },
    dialog,
    openCreate: () => setDialog({ mode: "create" }),
    closeDialog: () => setDialog(null),
    handleSaved,
    pendingRemoval,
    cancelRemoval: () => setPendingRemoval(null),
    confirmRemoval,
    isRemoving,
    actionError,
    dismissError: () => setActionError(null),
    isPinned,
    handleAction,
  };
}
