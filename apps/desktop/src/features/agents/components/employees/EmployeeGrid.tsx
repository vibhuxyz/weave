import { motion } from "motion/react";
import { PlusIcon } from "lucide-react";
import type { EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";
import type { CardAction } from "@/features/agents/lib";
import { CARD_ENTER_S, CARD_STAGGER_LIMIT, CARD_STAGGER_S, EASE_OUT } from "./constants";
import { EmployeeCard } from "./EmployeeCard";

interface EmployeeGridProps {
  readonly agents: readonly Agent[];
  readonly entriesById: ReadonlyMap<string, EmployeeEntry>;
  readonly isPinned: (agentId: string) => boolean;
  readonly canCreate: boolean;
  readonly onCreate: () => void;
  readonly onAction: (action: CardAction, agentId: string) => void;
}

export function EmployeeGrid({ agents, entriesById, isPinned, canCreate, onCreate, onAction }: EmployeeGridProps) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,15rem))] xl:justify-start">
      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
        aria-label="New employee"
        title={canCreate ? "New employee" : "Open a project to add employees"}
        className="flex aspect-square w-full items-center justify-center rounded-xl border border-border/50 border-dashed text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PlusIcon className="size-8 stroke-[1.25]" />
      </button>
      {agents.map((agent, index) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, y: 6, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: CARD_ENTER_S, delay: Math.min(index, CARD_STAGGER_LIMIT) * CARD_STAGGER_S, ease: EASE_OUT }}
        >
          <EmployeeCard agent={agent} entry={entriesById.get(agent.id)} isPinned={isPinned(agent.id)} onAction={onAction} />
        </motion.div>
      ))}
    </div>
  );
}
