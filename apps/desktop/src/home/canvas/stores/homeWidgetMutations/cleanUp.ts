import type { LayoutConstraints } from "@/home/canvas/layout";
import {
  clampToLayoutConstraints,
  GRID_SIZE,
  isLayoutConstraints,
  snapPoint,
  snapTo,
} from "@/home/canvas/lib";
import {
  clampWidgetSize,
  HOME_WIDGET_CATALOG,
  HOME_WIDGET_CATALOG_BY_ID,
  widgetSizeForInstance,
  widgetSizeProfile,
  type WidgetInstance,
  type WidgetSize,
} from "@/home/canvas/widgets";

const CLEAN_UP_GRID_GAP = 48;
const CLEAN_UP_GROUP_GAP = 96;
const CLEAN_UP_MAX_GROUP_ROWS = 4;

const WIDGET_TYPE_ORDER = new Map(
  HOME_WIDGET_CATALOG.map((entry, index) => [entry.id, index] as const),
);

function cleanUpStride(maxSize: number): number {
  return Math.ceil((maxSize + CLEAN_UP_GRID_GAP) / GRID_SIZE) * GRID_SIZE;
}

function cleanUpSize(instance: WidgetInstance): WidgetSize {
  const entry = HOME_WIDGET_CATALOG_BY_ID[instance.type];
  const size = entry?.preserveSizeOnCleanUp
    ? widgetSizeForInstance(instance)
    : clampWidgetSize(instance.type, widgetSizeProfile(instance).defaultSize);

  return {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
}

function catalogSortOrder(instance: WidgetInstance): number {
  return WIDGET_TYPE_ORDER.get(instance.type) ?? Number.MAX_SAFE_INTEGER;
}

function sortedForCleanUp(instances: WidgetInstance[]): WidgetInstance[] {
  return [...instances].sort((left, right) => {
    const typeOrder = catalogSortOrder(left) - catalogSortOrder(right);
    if (typeOrder !== 0) {
      return typeOrder;
    }

    const zOrder = left.z - right.z;
    if (zOrder !== 0) {
      return zOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

function widgetGroupBounds(instances: WidgetInstance[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return instances.reduce(
    (bounds, instance) => {
      const size = widgetSizeForInstance(instance);
      return {
        minX: Math.min(bounds.minX, instance.x),
        minY: Math.min(bounds.minY, instance.y),
        maxX: Math.max(bounds.maxX, instance.x + size.width),
        maxY: Math.max(bounds.maxY, instance.y + size.height),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function groupedForCleanUp(instances: WidgetInstance[]): WidgetInstance[][] {
  const groups = new Map<string, WidgetInstance[]>();

  for (const instance of sortedForCleanUp(instances)) {
    const group = groups.get(instance.type) ?? [];
    group.push(instance);
    groups.set(instance.type, group);
  }

  return [...groups.values()];
}

export function cleanUpWidgetsMutation(
  instances: WidgetInstance[],
  bounds?: LayoutConstraints,
): WidgetInstance[] | null {
  const cleanableInstances = instances.filter(
    (instance) => HOME_WIDGET_CATALOG_BY_ID[instance.type],
  );
  if (cleanableInstances.length === 0) {
    return null;
  }

  const groups = groupedForCleanUp(cleanableInstances);
  const currentBounds = widgetGroupBounds(cleanableInstances);
  const origin = snapPoint({
    x: currentBounds.minX,
    y: currentBounds.minY,
  });
  const nextById = new Map<string, WidgetInstance>();
  let changed = false;
  let groupX = origin.x;

  groups.forEach((group) => {
    const entry = HOME_WIDGET_CATALOG_BY_ID[group[0]?.type ?? ""];
    if (!entry) {
      return;
    }

    const cleanUpSizes = new Map(
      group.map((instance) => [instance.id, cleanUpSize(instance)]),
    );
    const maxSize = [...cleanUpSizes.values()].reduce(
      (maximum, size) => ({
        width: Math.max(maximum.width, size.width),
        height: Math.max(maximum.height, size.height),
      }),
      { width: 0, height: 0 },
    );
    const strideX = cleanUpStride(maxSize.width);
    const strideY = cleanUpStride(maxSize.height);
    const rows = Math.min(CLEAN_UP_MAX_GROUP_ROWS, group.length);
    const columns = Math.ceil(group.length / rows);

    group.forEach((instance, index) => {
      const size = cleanUpSizes.get(instance.id) ?? maxSize;
      const position = {
        x: snapTo(groupX + Math.floor(index / rows) * strideX),
        y: snapTo(origin.y + (index % rows) * strideY),
      };
      const resolvedPosition = isLayoutConstraints(bounds)
        ? clampToLayoutConstraints(position, size, bounds)
        : position;
      const next = {
        ...instance,
        ...resolvedPosition,
        z: nextById.size + 1,
        width: size.width,
        height: size.height,
      };

      if (
        instance.x !== next.x ||
        instance.y !== next.y ||
        instance.z !== next.z ||
        instance.width !== next.width ||
        instance.height !== next.height
      ) {
        changed = true;
      }

      nextById.set(instance.id, next);
    });

    groupX = snapTo(groupX + columns * strideX + CLEAN_UP_GROUP_GAP);
  });

  if (!changed) {
    return null;
  }

  return instances.map((instance) => nextById.get(instance.id) ?? instance);
}
