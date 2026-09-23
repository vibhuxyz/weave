import { useCallback, useEffect, useMemo } from "react";
import { useHomeWidgetStore } from "@/home/canvas/stores";

const PROJECT_PIN_TYPE = "projectPin";
const PIN_SCATTER_X_PX = 260;
const PIN_SCATTER_Y_PX = 220;

export function useProjectHomePins(): {
  readonly pinnedDirs: ReadonlySet<string>;
  readonly togglePin: (dir: string) => void;
} {
  const initialize = useHomeWidgetStore((s) => s.initialize);
  const instances = useHomeWidgetStore((s) => s.instances);
  const addWidget = useHomeWidgetStore((s) => s.addWidget);
  const removeWidget = useHomeWidgetStore((s) => s.removeWidget);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const widgetIdByDir = useMemo(() => {
    const byDir = new Map<string, string>();
    for (const instance of instances) {
      const dir = instance.state?.projectDir;
      if (instance.type === PROJECT_PIN_TYPE && typeof dir === "string") byDir.set(dir, instance.id);
    }
    return byDir;
  }, [instances]);

  const togglePin = useCallback(
    (dir: string) => {
      const widgetId = widgetIdByDir.get(dir);
      if (widgetId) {
        removeWidget(widgetId);
        return;
      }
      addWidget(
        PROJECT_PIN_TYPE,
        (Math.random() - 0.5) * PIN_SCATTER_X_PX,
        (Math.random() - 0.5) * PIN_SCATTER_Y_PX,
        { projectDir: dir },
      );
    },
    [widgetIdByDir, addWidget, removeWidget],
  );

  const pinnedDirs = useMemo(() => new Set(widgetIdByDir.keys()), [widgetIdByDir]);
  return { pinnedDirs, togglePin };
}
