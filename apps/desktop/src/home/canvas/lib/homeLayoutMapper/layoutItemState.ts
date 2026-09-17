import type { LayoutItem } from "@/home/canvas/layout";
import { LABEL_FONT_FAMILIES, type LabelFontFamily } from "@/home/canvas/widgets";
import {
  LABEL_WIDGET_VARIANT,
  SIZE_BY_PROFILE_STATE_KEY,
  STARTER_PROJECT_ID,
} from "./constants";
import {
  clockStateFromTarget,
  isSyntheticTarget,
  mergeState,
  nonEmptyStateString,
  readSizeByProfile,
  sanitizeChecklistItems,
  sanitizePhotoState,
  sanitizePromptPinState,
} from "./stateHelpers";

function persistedChatStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  if (typeof item.widgetState !== "object" || item.widgetState === null) {
    return undefined;
  }

  const state: Record<string, unknown> = {};
  if (
    item.widgetState.presentation === "expanded" ||
    item.widgetState.presentation === "collapsed"
  ) {
    state.presentation = item.widgetState.presentation;
  }
  const sizeByProfile = readSizeByProfile(item.widgetState);
  if (sizeByProfile) {
    state[SIZE_BY_PROFILE_STATE_KEY] = sizeByProfile;
  }
  return Object.keys(state).length > 0 ? state : undefined;
}

function persistedClockStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  const sizeByProfile = readSizeByProfile(item.widgetState);
  return sizeByProfile
    ? { [SIZE_BY_PROFILE_STATE_KEY]: sizeByProfile }
    : undefined;
}

function persistedStickyNoteStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  if (typeof item.widgetState !== "object" || item.widgetState === null) {
    return undefined;
  }

  const state: Record<string, unknown> = {};
  if (typeof item.widgetState.text === "string") {
    state.text = item.widgetState.text;
  }
  if (typeof item.widgetState.html === "string") {
    state.html = item.widgetState.html;
  }
  const isLabel =
    item.widgetState.variant === LABEL_WIDGET_VARIANT ||
    item.widgetState.tone === LABEL_WIDGET_VARIANT;
  if (typeof item.widgetState.tone === "string" && !isLabel) {
    state.tone = item.widgetState.tone;
  }
  if (typeof item.widgetState.fontSize === "string") {
    state.fontSize = item.widgetState.fontSize;
  }
  if (
    typeof item.widgetState.fontSizePx === "number" &&
    Number.isFinite(item.widgetState.fontSizePx)
  ) {
    state.fontSizePx = item.widgetState.fontSizePx;
  }
  if (
    LABEL_FONT_FAMILIES.includes(item.widgetState.fontFamily as LabelFontFamily)
  ) {
    state.fontFamily = item.widgetState.fontFamily;
  }
  if (isLabel) {
    state.variant = LABEL_WIDGET_VARIANT;
  }
  if (
    item.targetId === "onboarding:tour" &&
    item.widgetState.welcomeDismissed === true
  ) {
    state.welcomeDismissed = true;
  }

  return Object.keys(state).length > 0 ? state : undefined;
}

function persistedChecklistStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  if (typeof item.widgetState !== "object" || item.widgetState === null) {
    return undefined;
  }

  const state: Record<string, unknown> = {};
  if (typeof item.widgetState.title === "string") {
    state.title = item.widgetState.title;
  }
  if (typeof item.widgetState.tone === "string") {
    state.tone = item.widgetState.tone;
  }
  if (typeof item.widgetState.fontSize === "string") {
    state.fontSize = item.widgetState.fontSize;
  }
  const items = sanitizeChecklistItems(item.widgetState.items);
  if (items.length > 0) {
    state.items = items;
  }

  return Object.keys(state).length > 0 ? state : undefined;
}

function persistedPhotoStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  return typeof item.widgetState === "object" && item.widgetState !== null
    ? sanitizePhotoState(item.widgetState)
    : undefined;
}

function persistedPromptPinStateFromItem(
  item: LayoutItem,
): Record<string, unknown> | undefined {
  return typeof item.widgetState === "object" && item.widgetState !== null
    ? sanitizePromptPinState(item.widgetState)
    : undefined;
}

export function stateForItem(item: LayoutItem): Record<string, unknown> | undefined {
  if (item.kind !== "clock" && isSyntheticTarget(item.targetId)) {
    if (item.kind === "stickyNote") {
      return persistedStickyNoteStateFromItem(item);
    }
    if (item.kind === "checklist") {
      return persistedChecklistStateFromItem(item);
    }
    if (item.kind === "photo") {
      return persistedPhotoStateFromItem(item);
    }
    if (item.kind === "prompt") {
      return persistedPromptPinStateFromItem(item);
    }
    return undefined;
  }

  switch (item.kind) {
    case "persona":
      return { agentId: item.targetId };
    case "session":
      return mergeState(
        { sessionId: item.targetId },
        persistedChatStateFromItem(item),
      );
    case "project":
      return { projectId: item.targetId };
    case "automation":
      return { automationId: item.targetId };
    case "clock":
      return mergeState(
        clockStateFromTarget(item.targetId),
        persistedClockStateFromItem(item),
      );
    case "stickyNote":
      if (item.targetId === "onboarding:starter-project") {
        const persistedState =
          typeof item.widgetState === "object" && item.widgetState !== null
            ? item.widgetState
            : {};
        return {
          projectId:
            nonEmptyStateString(persistedState.projectId) ?? STARTER_PROJECT_ID,
          onboardingStarterProject: true,
        };
      }
      return mergeState(
        { noteId: item.targetId },
        persistedStickyNoteStateFromItem(item),
      );
    case "checklist":
      return persistedChecklistStateFromItem(item);
    case "photo":
      return persistedPhotoStateFromItem(item);
    case "skill":
      return { skillId: item.targetId };
    case "prompt":
      return persistedPromptPinStateFromItem(item);
    default: {
      const exhaustive: never = item.kind;
      return exhaustive;
    }
  }
}
