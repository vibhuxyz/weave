import { useEffect, useMemo, useRef } from "react";
import type { Agent } from "@/useAgents";
import { useAgents } from "@/useAgents";
import { GreeterWidget } from "@/features/onboarding/GreeterWidget";
import { StarterTaskChecklist } from "@/features/onboarding/StarterTaskChecklist";
import { useHomeWidgetStore } from "../stores/homeWidgetStore";
import { widgetSizeForInstance } from "../widgets/catalog";
import type { WidgetMutationHandlers } from "../widgets/types";
import { WidgetCanvas } from "./WidgetCanvas";

/**
 * Lean replacement for upstream `HomeView` — upstream pulls in telemetry,
 * onboarding, skills, projects and TopBarActions. This wires Berd's widget
 * store to `WidgetCanvas` and seeds a first-run layout. Pinning and the
 * widget picker land in later phases; onboarding now lands here as fixed
 * overlays (`GreeterWidget`, `StarterTaskChecklist`) rather than new canvas
 * widget types — see their own doc comments for why.
 */

const AGENT_RING_RADIUS = 320;
const CLOCK_CENTER = { x: 0, y: 40 };

/**
 * The starter pins on a fresh Home: two of the built-in agents, per the
 * call made when porting onboarding — a "code quality" agent and a "commit"
 * agent, standing in for upstream's named Tinker/Wildcard mascots (which
 * have no equivalent here).
 */
const STARTER_AGENT_IDS = ["builtin:reviewer", "builtin:committer"];

function seedLayout(
  agents: Agent[],
  addWidget: WidgetMutationHandlers["addWidget"],
): void {
  addWidget("clock", CLOCK_CENTER.x, CLOCK_CENTER.y);
  const starterAgents = STARTER_AGENT_IDS.map((id) =>
    agents.find((a) => a.id === id),
  ).filter((a): a is Agent => !!a);
  const ringAgents = starterAgents.length > 0 ? starterAgents : agents.slice(0, 6);
  ringAgents.forEach((agent, i) => {
    const angle = (i / ringAgents.length) * Math.PI * 2 - Math.PI / 2;
    addWidget(
      "agentPin",
      CLOCK_CENTER.x + Math.cos(angle) * AGENT_RING_RADIUS,
      CLOCK_CENTER.y + Math.sin(angle) * AGENT_RING_RADIUS,
      { agentId: agent.id },
    );
  });
}

export function HomeView({
  onOpenAgent,
  onCreateProject,
  onStartChat,
}: {
  onOpenAgent: (agentId: string) => void;
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
      />
      <StarterTaskChecklist
        onCreateProject={onCreateProject}
        onStartChat={onStartChat}
      />
      <GreeterWidget />
    </div>
  );
}
