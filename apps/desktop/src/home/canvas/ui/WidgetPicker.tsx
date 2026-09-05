import type { WidgetInstance } from "../widgets/types";

/**
 * Phase-1 stub for the upstream right-click widget picker (903 lines, pulls in
 * skills/automations/projects). Renders nothing; add-widget-from-canvas lands
 * in a later phase. The prop shape matches what WidgetCanvas passes.
 */
export const WIDGET_PICKER_WIDTH = 320;
export const WIDGET_PICKER_SIDE_OFFSET = 12;

export function WidgetPicker(_props: {
  open: boolean;
  x: number;
  y: number;
  side: "left" | "right";
  focusOnOpen: boolean;
  instances: WidgetInstance[];
  starterTasksAvailable?: boolean;
  onClose: () => void;
  onSelect: (type: string, state?: Record<string, unknown>) => void;
  onRestoreStarterTasks?: () => void;
}) {
  return null;
}
