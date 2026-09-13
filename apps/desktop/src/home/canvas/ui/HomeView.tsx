import { useEffect, useMemo, useRef } from "react";
import type { Agent } from "@/useAgents";
import { useAgents } from "@/useAgents";
import { GreeterWidget } from "@/features/onboarding/GreeterWidget";
import { useHomeWidgetStore } from "../stores/homeWidgetStore";
import { widgetSizeForInstance } from "../widgets/catalog";
import type { WidgetMutationHandlers } from "../widgets/types";
import { WidgetCanvas } from "./WidgetCanvas";

/**
 * Lean replacement for upstream `HomeView` — upstream pulls in telemetry,
 * onboarding, skills, projects and TopBarActions. This wires Berd's widget
 * store to `WidgetCanvas` and seeds a first-run layout. Pinning and the
 * widget picker land in later phases; onboarding now lands here as a fixed
 * overlay (`GreeterWidget`) rather than new canvas
 * widget types — see their own doc comments for why.
 *
 * The starter-task checklist that used to sit here is gone: the onboarding
 * flow now walks the same ground (engine, agents, project), so a second
 * to-do list covering it on first launch was redundant.
 */

const CLOCK_CENTER = { x: -140, y: 0 };

/**
 * The starter Home on a fresh install: a digital clock and the built-in
 * agents scattered around it — not a rigid ring — so the canvas opens
 * populated and lively rather than empty.
 *
 * `slot` is a widget-center offset from the origin, hand-placed to spread the
 * six pins (200×220) without overlap.
 */
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
      : agents.slice(0, STARTER_AGENTS.length).map((agent, i) => ({
          slot: STARTER_AGENTS[i],
          agent,
        }));

  for (const { slot, agent } of pins) {
    addWidget("agentPin", slot.x, slot.y, { agentId: agent.id });
  }
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
      <GreeterWidget />
    </div>
  );
}
