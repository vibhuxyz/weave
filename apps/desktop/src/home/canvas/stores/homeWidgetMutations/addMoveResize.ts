import type { LayoutConstraints } from "@/home/canvas/layout";
import { resolveWidgetResize } from "@/home/canvas/lib";
import {
  clampWidgetSize,
  HOME_WIDGET_CATALOG_BY_ID,
  widgetSizeForInstance,
  type MoveWidgetOptions,
  type WidgetInstance,
} from "@/home/canvas/widgets";
import { resolvePosition } from "./positioning";
import { applyNormalizedZOrder, maxZ, normalizedZById } from "./zOrder";

type AddWidgetOptions = {
  id: string;
  type: string;
  x: number;
  y: number;
  state?: Record<string, unknown>;
  bounds?: LayoutConstraints;
};

export function addWidgetMutation(
  instances: WidgetInstance[],
  { id, type, x, y, state, bounds }: AddWidgetOptions,
): WidgetInstance[] | null {
  const entry = HOME_WIDGET_CATALOG_BY_ID[type];
  if (!entry) {
    return null;
  }
  const size = clampWidgetSize(type, entry.defaultSize);

  const centered = resolvePosition(
    type,
    x - size.width / 2,
    y - size.height / 2,
    size,
    bounds,
  );

  return [
    ...instances,
    {
      id,
      type,
      x: centered.x,
      y: centered.y,
      z: maxZ(instances) + 1,
      width: size.width,
      height: size.height,
      state,
    },
  ];
}

export function moveWidgetMutation(
  instances: WidgetInstance[],
  id: string,
  x: number,
  y: number,
  bounds?: LayoutConstraints,
  options: MoveWidgetOptions = {},
): WidgetInstance[] | null {
  const target = instances.find((instance) => instance.id === id);
  if (!target) {
    return null;
  }

  const position = resolvePosition(
    target.type,
    x,
    y,
    widgetSizeForInstance(target),
    bounds,
    options.snapToGrid ?? true,
  );
  const moved = target.x !== position.x || target.y !== position.y;
  const nextInstances = moved
    ? instances.map((instance) =>
        instance.id === id ? { ...instance, ...position } : instance,
      )
    : instances;

  if (!options.bringToFront) {
    return moved ? nextInstances : null;
  }

  const zById = normalizedZById(nextInstances, id);
  const next = applyNormalizedZOrder(nextInstances, zById);
  if (
    !moved &&
    next.every((instance, index) => instance.z === nextInstances[index]?.z)
  ) {
    return null;
  }

  return next;
}

export function resizeWidgetMutation(
  instances: WidgetInstance[],
  id: string,
  width: number,
  height: number,
  bounds?: LayoutConstraints,
  options: MoveWidgetOptions = {},
): WidgetInstance[] | null {
  const target = instances.find((instance) => instance.id === id);
  if (!target) {
    return null;
  }

  const resolved = resolveWidgetResize({
    instance: target,
    requestedSize: { width, height },
    bounds,
  });
  const resized =
    target.width !== resolved.width ||
    target.height !== resolved.height ||
    target.x !== resolved.x ||
    target.y !== resolved.y;
  const nextInstances = resized
    ? instances.map((instance) =>
        instance.id === id ? { ...instance, ...resolved } : instance,
      )
    : instances;

  if (!options.bringToFront) {
    return resized ? nextInstances : null;
  }

  const zById = normalizedZById(nextInstances, id);
  const next = applyNormalizedZOrder(nextInstances, zById);
  if (
    !resized &&
    next.every((instance, index) => instance.z === nextInstances[index]?.z)
  ) {
    return null;
  }

  return next;
}
