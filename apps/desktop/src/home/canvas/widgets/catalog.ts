import { AgentPinWidget } from "./AgentPinWidget";
import { ClockWidget } from "./ClockWidget";
import { clockModeOf } from "./clockWidgetMode";
import type {
  WidgetCatalogEntry,
  WidgetCategory,
  WidgetInstance,
  WidgetSize,
  WidgetSizeBounds,
  WidgetSizeProfile,
} from "./types";

/**
 * Ported from upstream `features/home/widgets/catalog.ts` — the sizing /
 * profile machinery is verbatim. Phase 1 ships a reduced entry list: clock,
 * sticky note, label, checklist, photo, agent pin. The pin types that need
 * backend adapters (chat, project, automation, skill, prompt, onboarding tour)
 * land in later phases. The catalog is built for this — an entry with no
 * `Component` is a data-only stub.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const CLOCK_ANALOG_PROFILE: WidgetSizeProfile = {
  defaultSize: { width: 156, height: 156 },
  sizeBounds: {
    minWidth: 156,
    maxWidth: 360,
    minHeight: 156,
    maxHeight: 360,
    lockAspectRatio: true,
  },
};

const CLOCK_DIGITAL_PROFILE: WidgetSizeProfile = {
  defaultSize: { width: 224, height: 88 },
  sizeBounds: {
    minWidth: 198,
    maxWidth: 396,
    minHeight: 78,
    maxHeight: 156,
    lockAspectRatio: true,
  },
};

export const HOME_WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    id: "clock",
    category: "clock",
    labelKey: "widgets.clock.label",
    descriptionKey: "widgets.clock.description",
    defaultSize: CLOCK_ANALOG_PROFILE.defaultSize,
    sizeBounds: CLOCK_ANALOG_PROFILE.sizeBounds,
    preserveSizeOnCleanUp: true,
    resolveProfile: (instance) =>
      clockModeOf(instance) === "digital"
        ? CLOCK_DIGITAL_PROFILE
        : CLOCK_ANALOG_PROFILE,
    Component: ClockWidget,
  },
  {
    id: "agentPin",
    category: "agent",
    labelKey: "widgets.agentPin.label",
    defaultSize: { width: 200, height: 220 },
    sizeBounds: {
      minWidth: 120,
      maxWidth: 480,
      minHeight: 132,
      maxHeight: 528,
      lockAspectRatio: true,
    },
    Component: AgentPinWidget,
  },
];

export const HOME_WIDGET_CATALOG_BY_ID: Record<string, WidgetCatalogEntry> =
  Object.fromEntries(HOME_WIDGET_CATALOG.map((entry) => [entry.id, entry]));

export const HOME_WIDGET_CATEGORIES: WidgetCategory[] = [
  "clock",
  "agent",
  "note",
  "checklist",
  "photo",
];

export function widgetSizeProfile(instance: WidgetInstance): WidgetSizeProfile {
  const entry = HOME_WIDGET_CATALOG_BY_ID[instance.type];
  if (!entry) {
    return {
      defaultSize: { width: 1, height: 1 },
      sizeBounds: { minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1 },
    };
  }
  return (
    entry.resolveProfile?.(instance) ?? {
      defaultSize: entry.defaultSize,
      sizeBounds: entry.sizeBounds,
    }
  );
}

function clampSizeToProfile(
  profile: WidgetSizeProfile,
  size: WidgetSize,
): WidgetSize {
  const bounds = profile.sizeBounds;
  const requested = bounds.lockAspectRatio
    ? sizeWithLockedAspectRatio(profile.defaultSize, bounds, size)
    : size;

  return {
    width: clamp(requested.width, bounds.minWidth, bounds.maxWidth),
    height: clamp(requested.height, bounds.minHeight, bounds.maxHeight),
  };
}

export function widgetSizeForInstance(instance: WidgetInstance): WidgetSize {
  const profile = widgetSizeProfile(instance);
  return clampSizeToProfile(profile, {
    width: isFinitePositive(instance.width)
      ? instance.width
      : profile.defaultSize.width,
    height: isFinitePositive(instance.height)
      ? instance.height
      : profile.defaultSize.height,
  });
}

export function clampWidgetSize(type: string, size: WidgetSize): WidgetSize {
  const entry = HOME_WIDGET_CATALOG_BY_ID[type];
  if (!entry) {
    return size;
  }
  return clampSizeToProfile(
    { defaultSize: entry.defaultSize, sizeBounds: entry.sizeBounds },
    size,
  );
}

export function clampWidgetSizeForInstance(
  instance: WidgetInstance,
  size: WidgetSize,
): WidgetSize {
  return clampSizeToProfile(widgetSizeProfile(instance), size);
}

function sizeWithLockedAspectRatio(
  defaultSize: WidgetSize,
  bounds: WidgetSizeBounds,
  size: WidgetSize,
): WidgetSize {
  const aspectRatio = defaultSize.height / defaultSize.width;
  const width = Math.max(size.width, 1);
  const clampedWidth = clamp(width, bounds.minWidth, bounds.maxWidth);

  return {
    width: clampedWidth,
    height: clamp(
      clampedWidth * aspectRatio,
      bounds.minHeight,
      bounds.maxHeight,
    ),
  };
}
