import type { WidgetInstance } from "@/home/canvas/widgets";

export function maxZ(instances: WidgetInstance[]): number {
  return instances.reduce((max, instance) => Math.max(max, instance.z), 0);
}

export function normalizedZById(
  instances: WidgetInstance[],
  topWidgetId: string,
): Map<string, number> {
  return new Map(
    [...instances]
      .sort((left, right) => {
        if (left.id === topWidgetId) {
          return 1;
        }
        if (right.id === topWidgetId) {
          return -1;
        }
        return left.z - right.z;
      })
      .map((instance, index) => [instance.id, index + 1] as const),
  );
}

export function applyNormalizedZOrder(
  instances: WidgetInstance[],
  zById: Map<string, number>,
): WidgetInstance[] {
  return instances.map((instance) => ({
    ...instance,
    z: zById.get(instance.id) ?? instance.z,
  }));
}
