import type { MutableRefObject } from "react";
import { AgentAvatar } from "@/features/agents/components";
import type { Agent } from "@/features/agents/hooks";
import type { SkillView } from "@/features/skills/types";
import { cn } from "@/shared/lib";

type ItemRefs = MutableRefObject<(HTMLButtonElement | null)[]>;

export function AgentList({
  agents,
  emptyLabel,
  activeIndex,
  onHighlight,
  onPick,
  itemRefs,
}: {
  readonly agents: readonly Agent[];
  readonly emptyLabel: string;
  readonly activeIndex: number;
  readonly onHighlight: (index: number) => void;
  readonly onPick: (agent: Agent) => void;
  readonly itemRefs: ItemRefs;
}) {
  if (agents.length === 0) return <EmptyLine text={emptyLabel} />;
  return (
    <div className="max-h-72 overflow-y-auto pr-1">
      {agents.map((agent, index) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          active={index === activeIndex}
          onHighlight={() => onHighlight(index)}
          onPick={() => onPick(agent)}
          rowRef={(el) => {
            itemRefs.current[index] = el;
          }}
        />
      ))}
    </div>
  );
}

function AgentRow({
  agent,
  active,
  onHighlight,
  onPick,
  rowRef,
}: {
  readonly agent: Agent;
  readonly active: boolean;
  readonly onHighlight: () => void;
  readonly onPick: () => void;
  readonly rowRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      type="button"
      ref={rowRef}
      onMouseEnter={onHighlight}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
        active && "bg-agent-surface-hover",
      )}
    >
      <AgentAvatar
        name={agent.name}
        seed={agent.id}
        tint={agent.tint}
        icon={agent.icon}
        character={agent.character}
        size="sm"
        className="size-7 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-agent-text-bright">{agent.name}</span>
    </button>
  );
}

export function SkillList({
  skills,
  activeIndex,
  onHighlight,
  onPick,
  itemRefs,
}: {
  readonly skills: readonly SkillView[];
  readonly activeIndex: number;
  readonly onHighlight: (index: number) => void;
  readonly onPick: (skill: SkillView) => void;
  readonly itemRefs: ItemRefs;
}) {
  if (skills.length === 0) return <EmptyLine text="No skills match." />;
  return (
    <div className="max-h-72 overflow-y-auto pr-1">
      {skills.map((skill, index) => (
        <button
          key={skill.id}
          type="button"
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          onMouseEnter={() => onHighlight(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(skill);
          }}
          className={cn(
            "flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-colors",
            index === activeIndex && "bg-agent-surface-hover",
          )}
        >
          <span className="truncate text-agent-text-bright text-sm">{skill.name}</span>
          {skill.description ? (
            <span className="line-clamp-1 text-[11px] text-agent-text-faint">{skill.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function EmptyLine({ text }: { readonly text: string }) {
  return <p className="px-2.5 py-2 text-agent-text-faint text-xs">{text}</p>;
}
