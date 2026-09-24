import { useCallback, useEffect, useMemo } from "react";
import { useHomeWidgetStore } from "@/home/canvas/stores";

const PIN_WIDGET_TYPE = "agentPin";
const SCATTER_WIDTH_PX = 260;
const SCATTER_HEIGHT_PX = 220;

function scatter(spanPx: number): number {
  return (Math.random() - 0.5) * spanPx;
}

export function useHomePins() {
  const initialize = useHomeWidgetStore((state) => state.initialize);
  const instances = useHomeWidgetStore((state) => state.instances);
  const addWidget = useHomeWidgetStore((state) => state.addWidget);
  const removeWidget = useHomeWidgetStore((state) => state.removeWidget);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const widgetIdByAgent = useMemo(() => {
    const byAgent = new Map<string, string>();
    for (const instance of instances) {
      const agentId = instance.state?.agentId;
      if (instance.type === PIN_WIDGET_TYPE && typeof agentId === "string") byAgent.set(agentId, instance.id);
    }
    return byAgent;
  }, [instances]);

  const isPinned = useCallback((agentId: string) => widgetIdByAgent.has(agentId), [widgetIdByAgent]);

  const togglePin = useCallback(
    (agentId: string) => {
      const widgetId = widgetIdByAgent.get(agentId);
      if (widgetId) {
        removeWidget(widgetId);
        return;
      }
      addWidget(PIN_WIDGET_TYPE, scatter(SCATTER_WIDTH_PX), scatter(SCATTER_HEIGHT_PX), { agentId });
    },
    [widgetIdByAgent, addWidget, removeWidget],
  );

  return { isPinned, togglePin };
}
