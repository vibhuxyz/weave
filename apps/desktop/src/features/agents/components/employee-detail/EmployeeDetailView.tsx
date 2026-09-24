import { useEffect } from "react";
import { motion } from "motion/react";
import { useEmployeeDetail, type EmployeeActions, type EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";
import { sourceLabel, type CardAction } from "@/features/agents/lib";
import { AgentAvatar } from "../AgentAvatar";
import { AgentQuickComposer } from "../AgentQuickComposer";
import { EASE_OUT, ENTER_S } from "./constants";
import { FactRow } from "./DetailSection";
import { EmployeeDetailHeader } from "./EmployeeDetailHeader";
import { EmployeeSpec } from "./EmployeeSpec";
import { EmployeeTrackRecord } from "./EmployeeTrackRecord";

interface EmployeeDetailViewProps {
  readonly agent: Agent;
  readonly entry: EmployeeEntry;
  readonly isPinned: boolean;
  readonly readEmployee: EmployeeActions["readEmployee"];
  readonly onBack: () => void;
  readonly onAction: (action: CardAction, agentId: string) => void;
  readonly onChat: (agent: Agent, message?: string) => void;
}

export function EmployeeDetailView({ agent, entry, isPinned, readEmployee, onBack, onAction, onChat }: EmployeeDetailViewProps) {
  const detail = useEmployeeDetail(agent.id);
  const isDetailMissing = detail === undefined;

  useEffect(() => {
    if (isDetailMissing) readEmployee(agent.id);
  }, [agent.id, isDetailMissing, readEmployee]);

  return (
    <motion.div
      className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-8 pb-40 pt-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_S, ease: EASE_OUT }}
    >
      <EmployeeDetailHeader agent={agent} entry={entry} isPinned={isPinned} onBack={onBack} onAction={onAction} />
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <aside>
          <div className="mx-auto aspect-square w-full max-w-[280px]">
            <AgentAvatar name={agent.name} seed={agent.id} icon={agent.icon} character={agent.character} size="lg" />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-foreground">{entry.employee.description || "No description yet."}</p>
          <dl className="mt-6 border-t border-border/60 pt-4 text-sm">
            <FactRow label="Id"><span className="font-mono">{entry.employee.id}</span></FactRow>
            <FactRow label="Source">{sourceLabel(agent, entry)}</FactRow>
            {entry.employee.sourcePath && <FactRow label="File"><span className="font-mono text-xs">{entry.employee.sourcePath}</span></FactRow>}
          </dl>
        </aside>
        <div className="min-w-0 space-y-10">
          <EmployeeSpec employee={entry.employee} />
          <EmployeeTrackRecord entry={entry} detail={detail} />
        </div>
      </div>
      <AgentQuickComposer agent={agent} onStart={(message) => onChat(agent, message || undefined)} />
    </motion.div>
  );
}
