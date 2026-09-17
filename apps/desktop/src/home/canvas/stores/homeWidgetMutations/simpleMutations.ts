import type { WidgetInstance } from "@/home/canvas/widgets";
import { applyNormalizedZOrder, normalizedZById } from "./zOrder";

export function bumpZMutation(
  instances: WidgetInstance[],
  id: string,
): WidgetInstance[] | null {
  if (!instances.some((instance) => instance.id === id)) {
    return null;
  }

  return applyNormalizedZOrder(instances, normalizedZById(instances, id));
}

export function removeWidgetMutation(
  instances: WidgetInstance[],
  id: string,
): WidgetInstance[] | null {
  if (!instances.some((instance) => instance.id === id)) {
    return null;
  }

  return instances.filter((instance) => instance.id !== id);
}

export type WidgetLayoutSnapshotItem = Pick<
  WidgetInstance,
  "height" | "id" | "type" | "width" | "x" | "y" | "z"
>;

export function restoreWidgetsLayoutMutation(
  instances: WidgetInstance[],
  snapshot: WidgetLayoutSnapshotItem[],
): WidgetInstance[] | null {
  const snapshotById = new Map(snapshot.map((item) => [item.id, item]));
  let changed = false;
  const next = instances.map((instance) => {
    const item = snapshotById.get(instance.id);
    if (!item || item.type !== instance.type) {
      return instance;
    }

    const restored = {
      ...instance,
      x: item.x,
      y: item.y,
      z: item.z,
      ...(item.width === undefined ? {} : { width: item.width }),
      ...(item.height === undefined ? {} : { height: item.height }),
    };

    if (
      restored.x !== instance.x ||
      restored.y !== instance.y ||
      restored.z !== instance.z ||
      restored.width !== instance.width ||
      restored.height !== instance.height
    ) {
      changed = true;
    }

    return restored;
  });

  return changed ? next : null;
}
