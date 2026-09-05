/**
 * The home-canvas layout model + persistence API.
 *
 * Ported from upstream Berd's `features/layout/api/layout.ts`. The type model
 * (Layout / LayoutItem / camera / constraints / mutation requests) is verbatim.
 * The four functions — `getLayout`, `saveLayoutItems`, `saveLayoutCamera`,
 * `resetLayout` — keep the exact same signatures and revision-conflict
 * semantics, but are backed by `localStorage` here instead of the goosed
 * Tauri commands (`get_layout`, `save_layout_items`, …).
 *
 * Swapping this file for a Rust/file-backed implementation later is a
 * drop-in: nothing above it knows where the bytes live.
 */

export const HOME_LAYOUT_ID = "home";

export type LayoutItemKind =
  | "session"
  | "project"
  | "persona"
  | "clock"
  | "stickyNote"
  | "checklist"
  | "photo"
  | "automation"
  | "skill"
  | "prompt";

export interface LayoutConstraints {
  minCenter: number;
  maxCenter: number;
  minSize: number;
  maxSize: number;
  minZoomBps: number;
  maxZoomBps: number;
  maxTitleOverrideLength: number;
  maxItems: number;
}

export interface LayoutCamera {
  centerX: number;
  centerY: number;
  zoomBps: number;
}

export interface LayoutItem {
  id: string;
  kind: LayoutItemKind;
  targetId: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zIndex: number;
  titleOverride: string | null;
  widgetState?: Record<string, unknown> | null;
}

export interface Layout {
  layoutId: string;
  itemRevision: number;
  cameraRevision: number;
  camera: LayoutCamera;
  items: LayoutItem[];
  constraints: LayoutConstraints;
}

export type LayoutMutationResult =
  | { ok: true; layout: Layout }
  | { ok: false; reason: "revisionConflict"; layout: Layout };

export interface SaveLayoutItemsRequest {
  layoutId: string;
  expectedRevision: number;
  replaceKinds: LayoutItemKind[];
  items: LayoutItem[];
}

export interface SaveLayoutCameraRequest {
  layoutId: string;
  expectedRevision: number;
  camera: LayoutCamera;
}

export interface ResetLayoutRequest {
  layoutId: string;
  expectedItemRevision: number;
  expectedCameraRevision: number;
}

// ── localStorage backing ──────────────────────────────────────────────────

const STORAGE_PREFIX = "berd.layout.";

export const DEFAULT_CONSTRAINTS: LayoutConstraints = {
  minCenter: -12000,
  maxCenter: 12000,
  minSize: 80,
  maxSize: 1600,
  minZoomBps: 2500, // 0.25×
  maxZoomBps: 30000, // 3.00×
  maxTitleOverrideLength: 120,
  maxItems: 200,
};

function defaultLayout(layoutId: string): Layout {
  return {
    layoutId,
    itemRevision: 0,
    cameraRevision: 0,
    camera: { centerX: 0, centerY: 0, zoomBps: 10000 },
    items: [],
    constraints: DEFAULT_CONSTRAINTS,
  };
}

function storageKey(layoutId: string): string {
  return `${STORAGE_PREFIX}${layoutId}`;
}

function readLayout(layoutId: string): Layout {
  if (typeof window === "undefined") return defaultLayout(layoutId);
  try {
    const raw = window.localStorage.getItem(storageKey(layoutId));
    if (!raw) return defaultLayout(layoutId);
    const parsed = JSON.parse(raw) as Partial<Layout>;
    const base = defaultLayout(layoutId);
    return {
      ...base,
      ...parsed,
      constraints: { ...base.constraints, ...(parsed.constraints ?? {}) },
      camera: { ...base.camera, ...(parsed.camera ?? {}) },
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return defaultLayout(layoutId);
  }
}

function writeLayout(layout: Layout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(layout.layoutId), JSON.stringify(layout));
  } catch {
    // localStorage may be unavailable (private mode, quota) — the in-memory
    // store still holds the session's layout.
  }
}

export async function getLayout(layoutId: string): Promise<Layout> {
  return readLayout(layoutId);
}

export async function saveLayoutItems(
  request: SaveLayoutItemsRequest,
): Promise<LayoutMutationResult> {
  const current = readLayout(request.layoutId);
  if (current.itemRevision !== request.expectedRevision) {
    return { ok: false, reason: "revisionConflict", layout: current };
  }

  const replace = new Set(request.replaceKinds);
  const kept = current.items.filter((item) => !replace.has(item.kind));
  const next: Layout = {
    ...current,
    items: [...kept, ...request.items],
    itemRevision: current.itemRevision + 1,
  };
  writeLayout(next);
  return { ok: true, layout: next };
}

export async function saveLayoutCamera(
  request: SaveLayoutCameraRequest,
): Promise<LayoutMutationResult> {
  const current = readLayout(request.layoutId);
  if (current.cameraRevision !== request.expectedRevision) {
    return { ok: false, reason: "revisionConflict", layout: current };
  }

  const next: Layout = {
    ...current,
    camera: request.camera,
    cameraRevision: current.cameraRevision + 1,
  };
  writeLayout(next);
  return { ok: true, layout: next };
}

export async function resetLayout(
  request: ResetLayoutRequest,
): Promise<LayoutMutationResult> {
  const current = readLayout(request.layoutId);
  if (
    current.itemRevision !== request.expectedItemRevision ||
    current.cameraRevision !== request.expectedCameraRevision
  ) {
    return { ok: false, reason: "revisionConflict", layout: current };
  }

  const next: Layout = {
    ...defaultLayout(request.layoutId),
    itemRevision: current.itemRevision + 1,
    cameraRevision: current.cameraRevision + 1,
  };
  writeLayout(next);
  return { ok: true, layout: next };
}
