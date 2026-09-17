import {
  DIGITAL_CLOCK_TARGET_SUFFIX,
  PROMPT_PIN_TEXT_MAX_LENGTH,
  PROMPT_PIN_TITLE_MAX_LENGTH,
  SIZE_BY_PROFILE_STATE_KEY,
} from "./constants";

export function isSyntheticTarget(targetId: string): boolean {
  return targetId.startsWith("widget:");
}

export function syntheticTarget(instanceId: string): string {
  return `widget:${instanceId}`;
}

export function nonEmptyStateString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isWidgetSize(
  value: unknown,
): value is { width: number; height: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const size = value as Record<string, unknown>;
  return (
    typeof size.width === "number" &&
    Number.isFinite(size.width) &&
    size.width > 0 &&
    typeof size.height === "number" &&
    Number.isFinite(size.height) &&
    size.height > 0
  );
}

export function readSizeByProfile(
  state: Record<string, unknown> | null | undefined,
): Record<string, { width: number; height: number }> | undefined {
  const raw = state?.[SIZE_BY_PROFILE_STATE_KEY];
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }

  const entries = Object.entries(raw).filter(
    (entry): entry is [string, { width: number; height: number }] =>
      typeof entry[0] === "string" && isWidgetSize(entry[1]),
  );
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export function clockStateFromTarget(
  targetId: string,
): Record<string, unknown> | undefined {
  return targetId.endsWith(DIGITAL_CLOCK_TARGET_SUFFIX)
    ? { mode: "digital" }
    : undefined;
}

export function mergeState(
  ...states: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const merged = Object.assign({}, ...states.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function sanitizeChecklistItems(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.id === "string" && typeof record.text === "string") {
      items.push({
        id: record.id,
        text: record.text,
        done: record.done === true,
      });
    }
  }
  return items;
}

export function sanitizePhotoState(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const state: Record<string, unknown> = {};
  const sizeByProfile = readSizeByProfile(value);
  if (sizeByProfile) {
    state[SIZE_BY_PROFILE_STATE_KEY] = sizeByProfile;
  }
  if (typeof value.path === "string" && value.path.trim()) {
    state.path = value.path.trim();
  }
  if (
    typeof value.aspectRatio === "number" &&
    Number.isFinite(value.aspectRatio) &&
    value.aspectRatio > 0
  ) {
    state.aspectRatio = value.aspectRatio;
  }
  if (
    value.shape === "original" ||
    value.shape === "square" ||
    value.shape === "circle"
  ) {
    state.shape = value.shape;
  }
  return Object.keys(state).length > 0 ? state : undefined;
}

export function sanitizePromptPinState(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const state: Record<string, unknown> = {};
  if (typeof value.title === "string" && value.title.trim()) {
    state.title = value.title.slice(0, PROMPT_PIN_TITLE_MAX_LENGTH);
  }
  if (typeof value.text === "string" && value.text.trim()) {
    state.text = value.text.slice(0, PROMPT_PIN_TEXT_MAX_LENGTH);
  }
  const agentId = nonEmptyStateString(value.agentId);
  if (agentId) {
    state.agentId = agentId;
  }
  if (value.mode === "edit" || value.mode === "ready") {
    state.mode = value.mode;
  }
  const sizeByProfile = readSizeByProfile(value);
  if (sizeByProfile) {
    state[SIZE_BY_PROFILE_STATE_KEY] = sizeByProfile;
  }
  return Object.keys(state).length > 0 ? state : undefined;
}
