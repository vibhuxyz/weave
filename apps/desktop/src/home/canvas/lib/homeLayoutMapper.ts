import type { LayoutItem } from "@/home/canvas/layout";
import {
  clampWidgetSizeForInstance,
  HOME_WIDGET_CATALOG_BY_ID,
  widgetSizeForInstance,
  type WidgetInstance,
} from "@/home/canvas/widgets";
import {
  HOME_LAYOUT_REPLACE_KINDS,
  isHomeLayoutKind,
  KIND_TO_WIDGET_TYPE,
  LABEL_WIDGET_VARIANT,
  WIDGET_TYPE_TO_KIND,
} from "./homeLayoutMapper/constants";
import { stateForItem } from "./homeLayoutMapper/layoutItemState";
import {
  targetIdForWidget,
  widgetStateForLayoutItem,
} from "./homeLayoutMapper/widgetInstanceState";

export { HOME_LAYOUT_REPLACE_KINDS };

export function layoutItemsToHomeWidgets(
  items: LayoutItem[],
): WidgetInstance[] {
  return items.flatMap((item) => {
    if (!isHomeLayoutKind(item.kind)) {
      return [];
    }
    const type =
      item.kind === "stickyNote" && item.targetId === "onboarding:tour"
        ? "onboardingTour"
        : item.kind === "stickyNote" &&
            item.targetId === "onboarding:starter-project"
          ? "onboardingProjectArtifact"
          : item.kind === "stickyNote" &&
              (item.widgetState?.variant === LABEL_WIDGET_VARIANT ||
                item.widgetState?.tone === LABEL_WIDGET_VARIANT)
            ? "label"
            : KIND_TO_WIDGET_TYPE[item.kind];
    const size = HOME_WIDGET_CATALOG_BY_ID[type]?.defaultSize;
    if (!size) {
      return [];
    }
    const state = stateForItem(item);
    const widgetSize = clampWidgetSizeForInstance(
      {
        id: item.id,
        type,
        x: 0,
        y: 0,
        z: item.zIndex,
        width: item.width,
        height: item.height,
        ...(state ? { state } : {}),
      },
      { width: item.width, height: item.height },
    );
    return [
      {
        id: item.id,
        type,
        x: item.centerX - widgetSize.width / 2,
        y: item.centerY - widgetSize.height / 2,
        z: item.zIndex,
        width: widgetSize.width,
        height: widgetSize.height,
        ...(state ? { state } : {}),
      },
    ];
  });
}

export function homeWidgetsToLayoutItems(
  instances: WidgetInstance[],
): LayoutItem[] {
  return instances.flatMap((instance) => {
    const kind = WIDGET_TYPE_TO_KIND[instance.type];
    if (!kind) {
      return [];
    }
    if (!HOME_WIDGET_CATALOG_BY_ID[instance.type]?.defaultSize) {
      return [];
    }
    const size = widgetSizeForInstance(instance);
    const widgetState = widgetStateForLayoutItem(instance, kind);
    return [
      {
        id: instance.id,
        kind,
        targetId: targetIdForWidget(instance, kind),
        centerX: instance.x + size.width / 2,
        centerY: instance.y + size.height / 2,
        width: size.width,
        height: size.height,
        zIndex: instance.z,
        titleOverride: null,
        ...(widgetState ? { widgetState } : {}),
      },
    ];
  });
}
