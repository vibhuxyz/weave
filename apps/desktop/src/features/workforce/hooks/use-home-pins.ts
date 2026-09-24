import { useCallback, useEffect, useMemo } from "react";
import { useHomeWidgetStore } from "@/home/canvas/stores";

const PIN_SPREAD_X = 260;
const PIN_SPREAD_Y = 220;

export function useHomePins() {
  const initialize = useHomeWidgetStore((state) => state.initialize);
  const instances = useHomeWidgetStore((state) => state.instances);
  const addWidget = useHomeWidgetStore((state) => state.addWidget);
  const removeWidget = useHomeWidgetStore((state) => state.removeWidget);
  useEffect(() => {
    void initialize();
  }, [initialize]);

  const pinByAgentId = useMemo(() => {
    const pins = new Map<string, string>();
    for (const instance of instances) {
      const agentId = instance.state?.agentId;
      if (instance.type === "agentPin" && typeof agentId === "string") pins.set(agentId, instance.id);
    }
    return pins;
  }, [instances]);

  const togglePin = useCallback(
    (agentId: string) => {
      const existing = pinByAgentId.get(agentId);
      if (existing) {
        removeWidget(existing);
        return;
      }
      addWidget("agentPin", (Math.random() - 0.5) * PIN_SPREAD_X, (Math.random() - 0.5) * PIN_SPREAD_Y, { agentId });
    },
    [pinByAgentId, addWidget, removeWidget],
  );

  return { isPinned: (agentId: string) => pinByAgentId.has(agentId), togglePin };
}
