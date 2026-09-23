import { useEffect, useMemo, useRef } from "react";
import { useAgents, type Agent } from '@/features/agents/hooks';
import { GreeterWidget } from "@/features/onboarding";
import { useHomeWidgetStore } from "@/home/canvas/stores";
import { widgetSizeForInstance, type WidgetMutationHandlers } from "@/home/canvas/widgets";
import { WidgetCanvas } from "./WidgetCanvas";


const CLOCK_CENTER = { x: -140, y: 0 };

const STARTER_AGENTS: { id: string; x: number; y: number }[] = [
  { id: "builtin:generalist", x: -380, y: -180 },
  { id: "builtin:reviewer", x: 60, y: -260 },
  { id: "builtin:craftsman", x: 440, y: -110 },
  { id: "builtin:builder", x: -400, y: 200 },
  { id: "builtin:committer", x: 30, y: 260 },
  { id: "builtin:debugger", x: 450, y: 180 },
];

function seedLayout(
  agents: Agent[],
  addWidget: WidgetMutationHandlers["addWidget"],
): void {
  addWidget("clock", CLOCK_CENTER.x, CLOCK_CENTER.y, { mode: "digital" });

  const placed = STARTER_AGENTS.map((slot) => ({
    slot,
    agent: agents.find((a) => a.id === slot.id),
  })).filter((p): p is { slot: (typeof STARTER_AGENTS)[number]; agent: Agent } => !!p.agent);

  // Built-ins missing (user cleared them) — fall back to whatever they have.
  const pins =
    placed.length > 0
      ? placed
      : agents
          .slice(0, STARTER_AGENTS.length)
          .map((agent, i) => ({ slot: STARTER_AGENTS[i], agent }))
          .filter(
            (p): p is { slot: (typeof STARTER_AGENTS)[number]; agent: Agent } =>
              !!p.slot,
          );

  for (const { slot, agent } of pins) {
    addWidget("agentPin", slot.x, slot.y, { agentId: agent.id });
  }
}

export function HomeView({
  onOpenAgent,
  onOpenProject,
  onCreateProject,
  onStartChat,
}: {
  onOpenAgent: (agentId: string) => void;
  onOpenProject?: (projectDir: string) => void;
  onCreateProject?: () => void;
  onStartChat?: () => void;
}) {
  const { agents } = useAgents();
  const initialize = useHomeWidgetStore((s) => s.initialize);
  const loadStatus = useHomeWidgetStore((s) => s.loadStatus);
  const instances = useHomeWidgetStore((s) => s.instances);
  const addWidget = useHomeWidgetStore((s) => s.addWidget);
  const moveWidget = useHomeWidgetStore((s) => s.moveWidget);
  const resizeWidget = useHomeWidgetStore((s) => s.resizeWidget);
  const bumpZ = useHomeWidgetStore((s) => s.bumpZ);
  const removeWidget = useHomeWidgetStore((s) => s.removeWidget);
  const updateWidgetState = useHomeWidgetStore((s) => s.updateWidgetState);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (
      loadStatus === "ready" &&
      instances.length === 0 &&
      agents.length > 0 &&
      !seededRef.current
    ) {
      seededRef.current = true;
      seedLayout(agents, addWidget);
    }
  }, [loadStatus, instances.length, agents, addWidget]);

  const mutations = useMemo<WidgetMutationHandlers>(
    () => ({
      addWidget,
      moveWidget,
      resizeWidget,
      bumpZ,
      removeWidget,
      updateWidgetState,
    }),
    [addWidget, moveWidget, resizeWidget, bumpZ, removeWidget, updateWidgetState],
  );

  const recenterTarget = useMemo(() => {
    const clock = instances.find((i) => i.type === "clock");
    if (!clock) return CLOCK_CENTER;
    const size = widgetSizeForInstance(clock);
    return { x: clock.x + size.width / 2, y: clock.y + size.height / 2 };
  }, [instances]);

  const recenter = useHomeWidgetStore((s) => s.saveCamera);

  return (
    <div className="absolute inset-0">
      <WidgetCanvas
        instances={instances}
        mutations={mutations}
        onRecenter={() =>
          recenter({
            centerX: recenterTarget.x,
            centerY: recenterTarget.y,
            zoomBps: 10000,
          })
        }
        recenterTarget={recenterTarget}
        onOpenAgent={onOpenAgent}
        onTagAgentInComposer={onOpenAgent}
        onOpenProject={onOpenProject}
      />
      <GreeterWidget />
    </div>
  );
}
