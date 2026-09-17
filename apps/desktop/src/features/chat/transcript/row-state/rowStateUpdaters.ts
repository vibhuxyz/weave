import {
  assertNever,
  type TranscriptMcpActivityKind,
  type TranscriptMcpAppRowState,
  type TranscriptOpenOverlayKind,
  type TranscriptOverlayRowState,
} from "./types";

export function omitCustomKey(
  custom: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  if (!custom || !(key in custom)) {
    return custom;
  }

  const next = { ...custom };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function updateOverlayState(
  current: TranscriptOverlayRowState | undefined,
  kind: TranscriptOpenOverlayKind,
  overlayId: string,
  open: boolean,
): TranscriptOverlayRowState | undefined {
  const next: TranscriptOverlayRowState = current ? { ...current } : {};
  next.openOverlayIds = updateStringList(next.openOverlayIds, overlayId, open);

  switch (kind) {
    case "menu":
    case "context-menu":
      next.openMenuIds = updateStringList(next.openMenuIds, overlayId, open);
      break;
    case "dialog":
      next.openDialogIds = updateStringList(
        next.openDialogIds,
        overlayId,
        open,
      );
      break;
    case "popover":
      next.openPopoverIds = updateStringList(
        next.openPopoverIds,
        overlayId,
        open,
      );
      break;
    case "lightbox":
      next.openLightboxIds = updateStringList(
        next.openLightboxIds,
        overlayId,
        open,
      );
      break;
    case "other":
      break;
    default:
      assertNever(kind);
  }

  return hasOverlayState(next) ? next : undefined;
}

function updateStringList(
  values: readonly string[] | undefined,
  value: string,
  include: boolean,
): readonly string[] | undefined {
  const set = new Set(values ?? []);
  if (include) {
    set.add(value);
  } else {
    set.delete(value);
  }
  return set.size > 0 ? [...set].sort() : undefined;
}

function hasOverlayState(state: TranscriptOverlayRowState): boolean {
  return Boolean(
    state.openOverlayIds?.length ||
      state.openMenuIds?.length ||
      state.openDialogIds?.length ||
      state.openPopoverIds?.length ||
      state.openLightboxIds?.length,
  );
}

export function updateMcpState(
  current: TranscriptMcpAppRowState | undefined,
  kind: TranscriptMcpActivityKind,
  active: boolean,
  nowMs: number,
  sourceId: string,
): TranscriptMcpAppRowState {
  const next: TranscriptMcpAppRowState = current ? { ...current } : {};

  switch (kind) {
    case "host-request":
      next.lifecycle = active ? "active-host-request" : next.lifecycle;
      next.activeHostRequestIds = updateStringList(
        next.activeHostRequestIds,
        sourceId,
        active,
      );
      break;
    case "nested-tool-request":
      next.lifecycle = active ? "active-host-request" : next.lifecycle;
      next.activeNestedToolRequestIds = updateStringList(
        next.activeNestedToolRequestIds,
        sourceId,
        active,
      );
      break;
    case "recent-message":
      next.lifecycle = active ? "recently-messaged" : next.lifecycle;
      next.lastMessageAtMs = active ? nowMs : next.lastMessageAtMs;
      break;
    case "recent-resize":
      next.lifecycle = active ? "recently-resized" : next.lifecycle;
      next.lastResizeAtMs = active ? nowMs : next.lastResizeAtMs;
      break;
    default:
      assertNever(kind);
  }

  return next;
}

export function isExpiringMcpActivity(
  kind: TranscriptMcpActivityKind,
): boolean {
  return kind === "recent-message" || kind === "recent-resize";
}
