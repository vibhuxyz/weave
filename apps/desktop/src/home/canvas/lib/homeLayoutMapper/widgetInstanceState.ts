import {
  clockModeOf,
  LABEL_FONT_FAMILIES,
  type LabelFontFamily,
  type WidgetInstance,
} from "@/home/canvas/widgets";
import {
  DIGITAL_CLOCK_TARGET_SUFFIX,
  LABEL_WIDGET_VARIANT,
  SIZE_BY_PROFILE_STATE_KEY,
  STARTER_PROJECT_ID,
  type HomeLayoutKind,
} from "./constants";
import {
  nonEmptyStateString,
  readSizeByProfile,
  sanitizeChecklistItems,
  sanitizePhotoState,
  sanitizePromptPinState,
  syntheticTarget,
} from "./stateHelpers";

export function widgetStateForLayoutItem(
  instance: WidgetInstance,
  kind: HomeLayoutKind,
): Record<string, unknown> | undefined {
  switch (kind) {
    case "clock": {
      const sizeByProfile = readSizeByProfile(instance.state);
      return sizeByProfile
        ? { [SIZE_BY_PROFILE_STATE_KEY]: sizeByProfile }
        : undefined;
    }
    case "stickyNote": {
      if (instance.type === "onboardingProjectArtifact") {
        return {
          projectId:
            nonEmptyStateString(instance.state?.projectId) ??
            STARTER_PROJECT_ID,
          onboardingStarterProject: true,
        };
      }
      const state: Record<string, unknown> = {};
      if (instance.type === "label") {
        state.variant = LABEL_WIDGET_VARIANT;
      }
      if (typeof instance.state?.text === "string") {
        state.text = instance.state.text;
      }
      if (typeof instance.state?.html === "string") {
        state.html = instance.state.html;
      }
      if (typeof instance.state?.tone === "string") {
        state.tone = instance.state.tone;
      }
      if (typeof instance.state?.fontSize === "string") {
        state.fontSize = instance.state.fontSize;
      }
      if (
        typeof instance.state?.fontSizePx === "number" &&
        Number.isFinite(instance.state.fontSizePx)
      ) {
        state.fontSizePx = instance.state.fontSizePx;
      }
      if (
        LABEL_FONT_FAMILIES.includes(
          instance.state?.fontFamily as LabelFontFamily,
        )
      ) {
        state.fontFamily = instance.state?.fontFamily;
      }
      if (
        instance.type === "onboardingTour" &&
        instance.state?.welcomeDismissed === true
      ) {
        state.welcomeDismissed = true;
      }
      return Object.keys(state).length > 0 ? state : undefined;
    }
    case "checklist": {
      const state: Record<string, unknown> = {};
      if (typeof instance.state?.title === "string") {
        state.title = instance.state.title;
      }
      if (typeof instance.state?.tone === "string") {
        state.tone = instance.state.tone;
      }
      if (typeof instance.state?.fontSize === "string") {
        state.fontSize = instance.state.fontSize;
      }
      const items = sanitizeChecklistItems(instance.state?.items);
      if (items.length > 0) {
        state.items = items;
      }
      return Object.keys(state).length > 0 ? state : undefined;
    }
    case "photo":
      return sanitizePhotoState(instance.state);
    case "session": {
      const state: Record<string, unknown> = {};
      if (
        instance.state?.presentation === "expanded" ||
        instance.state?.presentation === "collapsed"
      ) {
        state.presentation = instance.state.presentation;
      }
      const sizeByProfile = readSizeByProfile(instance.state);
      if (sizeByProfile) {
        state[SIZE_BY_PROFILE_STATE_KEY] = sizeByProfile;
      }
      return Object.keys(state).length > 0 ? state : undefined;
    }
    case "prompt":
      return sanitizePromptPinState(instance.state);
    case "persona":
    case "project":
    case "automation":
    case "skill":
      return undefined;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function targetIdForWidget(
  instance: WidgetInstance,
  kind: HomeLayoutKind,
): string {
  const state = instance.state ?? {};
  switch (kind) {
    case "clock":
      return clockModeOf(instance) === "digital"
        ? `${syntheticTarget(instance.id)}${DIGITAL_CLOCK_TARGET_SUFFIX}`
        : syntheticTarget(instance.id);
    case "stickyNote":
      if (instance.type === "onboardingProjectArtifact") {
        return "onboarding:starter-project";
      }
      return nonEmptyStateString(state.noteId) ?? syntheticTarget(instance.id);
    case "checklist":
    case "photo":
    case "prompt":
      return syntheticTarget(instance.id);
    case "persona":
      return nonEmptyStateString(state.agentId) ?? syntheticTarget(instance.id);
    case "session":
      return (
        nonEmptyStateString(state.sessionId) ?? syntheticTarget(instance.id)
      );
    case "project":
      return (
        nonEmptyStateString(state.projectId) ?? syntheticTarget(instance.id)
      );
    case "automation":
      return (
        nonEmptyStateString(state.automationId) ?? syntheticTarget(instance.id)
      );
    case "skill":
      return nonEmptyStateString(state.skillId) ?? syntheticTarget(instance.id);
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
