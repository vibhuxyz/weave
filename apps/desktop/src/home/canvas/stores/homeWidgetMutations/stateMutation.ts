import type { LayoutConstraints } from "@/home/canvas/layout";
import { clampToLayoutConstraints, isLayoutConstraints } from "@/home/canvas/lib";
import {
  clampWidgetSizeForInstance,
  HOME_WIDGET_CATALOG_BY_ID,
  widgetSizeForInstance,
  widgetSizeProfile,
  type WidgetInstance,
  type WidgetSizeProfile,
} from "@/home/canvas/widgets";
import {
  profileKey,
  readSizeMemory,
  rememberedSizeForProfile,
  SIZE_BY_PROFILE_STATE_KEY,
} from "./sizeMemory";

function isStateMergeNoop(
  currentState: Record<string, unknown> | undefined,
  nextPatch: Record<string, unknown>,
): boolean {
  const current = currentState ?? {};

  return Object.keys(nextPatch).every(
    (key) =>
      Object.hasOwn(current, key) && Object.is(current[key], nextPatch[key]),
  );
}

function resolvedContentOffset(
  profile: WidgetSizeProfile,
  size: { width: number; height: number },
) {
  if (typeof profile.contentOffset === "function") {
    return profile.contentOffset(size);
  }
  return profile.contentOffset ?? { x: 0, y: 0 };
}

export function updateWidgetStateMutation(
  instances: WidgetInstance[],
  id: string,
  state: Record<string, unknown>,
  bounds?: LayoutConstraints,
): WidgetInstance[] | null {
  const target = instances.find((instance) => instance.id === id);
  if (!target) {
    return null;
  }

  if (isStateMergeNoop(target.state, state)) {
    return null;
  }

  const nextState = { ...(target.state ?? {}), ...state };
  const nextInstance: WidgetInstance = { ...target, state: nextState };

  const prevProfile = widgetSizeProfile(target);
  const nextProfile = widgetSizeProfile(nextInstance);
  const profileChanged =
    prevProfile.defaultSize.width !== nextProfile.defaultSize.width ||
    prevProfile.defaultSize.height !== nextProfile.defaultSize.height;

  if (!profileChanged) {
    return instances.map((instance) =>
      instance.id === id ? nextInstance : instance,
    );
  }

  // The state change moved the instance to a different size profile (the
  // clock's analog<->digital toggle). Remember the size we're leaving, then
  // restore the size last used in the profile we're entering — falling back to
  // that profile's default the first time it's seen. This lets each face keep
  // its own custom size across toggles.
  const sizeMemory = {
    ...readSizeMemory(target.state),
    [profileKey(prevProfile)]: widgetSizeForInstance(target),
  };
  const remembered = rememberedSizeForProfile(
    target.type,
    sizeMemory,
    nextProfile,
  );
  const preserveWidth =
    HOME_WIDGET_CATALOG_BY_ID[target.type]?.preserveWidthOnProfileChange;
  const currentSize = widgetSizeForInstance(target);
  const inheritedSize = preserveWidth
    ? {
        width: currentSize.width,
        height:
          currentSize.width *
          (nextProfile.defaultSize.height / nextProfile.defaultSize.width),
      }
    : null;
  const nextSize = remembered
    ? clampWidgetSizeForInstance(nextInstance, remembered)
    : inheritedSize
      ? clampWidgetSizeForInstance(nextInstance, inheritedSize)
      : nextProfile.defaultSize;
  const preservePosition =
    HOME_WIDGET_CATALOG_BY_ID[target.type]?.preservePositionOnProfileChange;
  const prevSize = widgetSizeForInstance(target);
  const prevContentOffset = resolvedContentOffset(prevProfile, prevSize);
  const nextContentOffset = resolvedContentOffset(nextProfile, nextSize);
  const requestedPosition = preservePosition
    ? {
        x: target.x + prevContentOffset.x - nextContentOffset.x,
        y: target.y + prevContentOffset.y - nextContentOffset.y,
      }
    : {
        x: Math.round(target.x + (prevSize.width - nextSize.width) / 2),
        y: Math.round(target.y + (prevSize.height - nextSize.height) / 2),
      };
  const position = isLayoutConstraints(bounds)
    ? clampToLayoutConstraints(requestedPosition, nextSize, bounds)
    : requestedPosition;

  const sized: WidgetInstance = {
    ...nextInstance,
    ...position,
    width: nextSize.width,
    height: nextSize.height,
    state: { ...nextState, [SIZE_BY_PROFILE_STATE_KEY]: sizeMemory },
  };

  return instances.map((instance) => (instance.id === id ? sized : instance));
}
