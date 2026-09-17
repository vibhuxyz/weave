import type { LayoutConstraints } from "@/home/canvas/layout";
import {
  clampToLayoutConstraints,
  isLayoutConstraints,
  snapPoint,
} from "@/home/canvas/lib";
import { HOME_WIDGET_CATALOG_BY_ID, type WidgetSize } from "@/home/canvas/widgets";

export function resolvePosition(
  type: string,
  x: number,
  y: number,
  size: WidgetSize,
  bounds?: LayoutConstraints,
  snapToGrid = true,
): { x: number; y: number } {
  const entry = HOME_WIDGET_CATALOG_BY_ID[type];
  const position = snapToGrid ? snapPoint({ x, y }) : { x, y };
  if (!entry || !isLayoutConstraints(bounds)) {
    return position;
  }
  return clampToLayoutConstraints(position, size, bounds);
}
