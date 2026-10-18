import type { MutableRefObject } from "react";
import type { Agent } from "@/features/agents/hooks";
import type { SkillView } from "@/features/skills/types";
import { cn } from "@/shared/lib";
import { TAB_COPY } from "./constants";
import { AgentList, SkillList } from "./lists";
import { MENTION_TABS, type MentionTab } from "./types";

export function MentionMenu({
  tab,
  onTabChange,
  employees,
  agents,
  skills,
  activeIndex,
  onHighlight,
  onPickAgent,
  onPickSkill,
  itemRefs,
}: {
  readonly tab: MentionTab;
  readonly onTabChange: (tab: MentionTab) => void;
  readonly employees: readonly Agent[];
  readonly agents: readonly Agent[];
  readonly skills: readonly SkillView[];
  readonly activeIndex: number;
  readonly onHighlight: (index: number) => void;
  readonly onPickAgent: (agent: Agent) => void;
  readonly onPickSkill: (skill: SkillView) => void;
  readonly itemRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
      <TabBar tab={tab} onTabChange={onTabChange} />
      {tab === "skills" ? (
        <SkillList skills={skills} activeIndex={activeIndex} onHighlight={onHighlight} onPick={onPickSkill} itemRefs={itemRefs} />
      ) : (
        <AgentList
          agents={tab === "employees" ? employees : agents}
          emptyLabel={tab === "employees" ? "No employees match." : "No agents match."}
          activeIndex={activeIndex}
          onHighlight={onHighlight}
          onPick={onPickAgent}
          itemRefs={itemRefs}
        />
      )}
    </div>
  );
}

function TabBar({ tab, onTabChange }: { readonly tab: MentionTab; readonly onTabChange: (tab: MentionTab) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-1 pb-2 text-sm">
      {MENTION_TABS.map((id) => {
        const copy = TAB_COPY[id];
        const selected = tab === id;
        return (
          <button
            key={id}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onTabChange(id);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              selected ? "bg-agent-surface-hover text-agent-text-bright" : "text-agent-text-faint hover:text-agent-text-bright",
            )}
          >
            {copy.label} <span className="text-agent-text-faint">{copy.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
