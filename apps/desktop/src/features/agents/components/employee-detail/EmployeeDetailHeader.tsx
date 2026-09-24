import { ChevronLeftIcon, MessageCircleIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon } from "lucide-react";
import type { EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";
import { menuActionsFor, type CardAction, type MenuAction } from "@/features/agents/lib";
import { cn } from "@/shared/lib";
import { ActionMenu } from "../employee-actions";

const HEADER_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const HEADER_PRIMARY: ReadonlySet<MenuAction> = new Set(["edit", "customize", "toggle-home"]);

interface EmployeeDetailHeaderProps {
  readonly agent: Agent;
  readonly entry: EmployeeEntry;
  readonly isPinned: boolean;
  readonly onBack: () => void;
  readonly onAction: (action: CardAction, agentId: string) => void;
}

export function EmployeeDetailHeader({ agent, entry, isPinned, onBack, onAction }: EmployeeDetailHeaderProps) {
  const actions = menuActionsFor(agent, entry);
  const editAction = actions.find((action) => action === "edit" || action === "customize");
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to employees"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <h1 className="truncate text-xl font-medium text-foreground">{agent.name}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={HEADER_BUTTON} onClick={() => onAction("chat", agent.id)}>
          <MessageCircleIcon className="size-4" />
          Start chat
        </button>
        {editAction && (
          <button type="button" className={HEADER_BUTTON} onClick={() => onAction(editAction, agent.id)}>
            <PencilIcon className="size-4" />
            {editAction === "edit" ? "Edit" : "Customize"}
          </button>
        )}
        <button type="button" className={HEADER_BUTTON} onClick={() => onAction("toggle-home", agent.id)}>
          {isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          {isPinned ? "Remove from home" : "Add to home"}
        </button>
        <ActionMenu
          actions={actions.filter((action) => !HEADER_PRIMARY.has(action))}
          isPinned={isPinned}
          label="More actions"
          onAction={(action) => onAction(action, agent.id)}
          trigger={(props) => (
            <button {...props} type="button" className={cn(HEADER_BUTTON, "w-10 justify-center px-0")}>
              <MoreHorizontalIcon className="size-4" />
            </button>
          )}
        />
      </div>
    </header>
  );
}
