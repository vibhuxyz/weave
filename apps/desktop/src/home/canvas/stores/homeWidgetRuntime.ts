import {
  getLayout,
  HOME_LAYOUT_ID,
  saveLayoutCamera,
  saveLayoutItems,
  type Layout,
  type LayoutCamera,
  type LayoutConstraints,
} from "@/home/canvas/layout/layout";
import {
  homeWidgetsToLayoutItems,
  HOME_LAYOUT_REPLACE_KINDS,
  layoutItemsToHomeWidgets,
} from "../lib/homeLayoutMapper";
import type { WidgetInstance } from "../widgets/types";

/**
 * The persistence engine behind `homeWidgetStore`.
 *
 * A trimmed adaptation of upstream's `homeWidgetRuntime.ts` (862 lines). Kept:
 * load-on-init, debounced item + camera saves, and revision-conflict retry
 * (re-read the layout, adopt the server revision, re-send). Dropped: the
 * onboarding seeding, starter-layout recovery, and pending-camera machinery,
 * which land with Phase 4.
 */

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type SaveStatus = "idle" | "saving";

export type HomeWidgetState = {
  instances: WidgetInstance[];
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  error: string | null;
  itemRevision: number | null;
  camera: LayoutCamera | null;
  cameraRevision: number | null;
  constraints: LayoutConstraints | null;
  cameraSaveStatus: SaveStatus;
  lastConfirmedLayout: Layout | null;
};

export const initialHomeWidgetState = {
  instances: [],
  loadStatus: "idle",
  saveStatus: "idle",
  error: null,
  itemRevision: null,
  camera: null,
  cameraRevision: null,
  constraints: null,
  cameraSaveStatus: "idle",
  lastConfirmedLayout: null,
} satisfies HomeWidgetState;

type StatePatch =
  | Partial<HomeWidgetState>
  | ((state: HomeWidgetState) => Partial<HomeWidgetState>);

type Options = {
  getState: () => HomeWidgetState;
  setState: (patch: StatePatch) => void;
  onItemSaveConfirmed?: () => void;
};

const SAVE_DEBOUNCE_MS = 200;
const MAX_CONFLICT_RETRIES = 3;

function adoptLayout(layout: Layout): Partial<HomeWidgetState> {
  return {
    instances: layoutItemsToHomeWidgets(layout.items),
    itemRevision: layout.itemRevision,
    camera: layout.camera,
    cameraRevision: layout.cameraRevision,
    constraints: layout.constraints,
    lastConfirmedLayout: layout,
  };
}

export function createHomeWidgetRuntime({
  getState,
  setState,
  onItemSaveConfirmed,
}: Options) {
  let initializePromise: Promise<void> | null = null;

  let itemTimer: ReturnType<typeof setTimeout> | null = null;
  let cameraTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingInstances: WidgetInstance[] | null = null;
  let pendingCamera: LayoutCamera | null = null;
  let itemSaveChain: Promise<void> = Promise.resolve();
  let cameraSaveChain: Promise<void> = Promise.resolve();

  async function flushItems(): Promise<void> {
    const instances = pendingInstances;
    pendingInstances = null;
    if (!instances) return;

    setState({ saveStatus: "saving" });
    let expected = getState().itemRevision ?? 0;
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      try {
        const result = await saveLayoutItems({
          layoutId: HOME_LAYOUT_ID,
          expectedRevision: expected,
          replaceKinds: HOME_LAYOUT_REPLACE_KINDS,
          items: homeWidgetsToLayoutItems(instances),
        });
        if (result.ok) {
          setState((state) => ({
            itemRevision: result.layout.itemRevision,
            lastConfirmedLayout: result.layout,
            // Keep the live instances; only adopt the server revision.
            constraints: result.layout.constraints,
            camera: state.camera ?? result.layout.camera,
            cameraRevision: state.cameraRevision ?? result.layout.cameraRevision,
          }));
          onItemSaveConfirmed?.();
          break;
        }
        // Conflict — adopt the server revision and retry with our instances.
        expected = result.layout.itemRevision;
        setState({
          constraints: result.layout.constraints,
          lastConfirmedLayout: result.layout,
        });
      } catch (error) {
        setState({
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    setState({ saveStatus: "idle" });
  }

  async function flushCamera(): Promise<void> {
    const camera = pendingCamera;
    pendingCamera = null;
    if (!camera) return;

    setState({ cameraSaveStatus: "saving" });
    let expected = getState().cameraRevision ?? 0;
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      try {
        const result = await saveLayoutCamera({
          layoutId: HOME_LAYOUT_ID,
          expectedRevision: expected,
          camera,
        });
        if (result.ok) {
          setState({
            cameraRevision: result.layout.cameraRevision,
            camera: result.layout.camera,
          });
          break;
        }
        expected = result.layout.cameraRevision;
      } catch (error) {
        setState({
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    setState({ cameraSaveStatus: "idle" });
  }

  return {
    initialize(): Promise<void> {
      if (initializePromise) return initializePromise;
      initializePromise = (async () => {
        setState({ loadStatus: "loading", error: null });
        try {
          const layout = await getLayout(HOME_LAYOUT_ID);
          setState({ ...adoptLayout(layout), loadStatus: "ready" });
        } catch (error) {
          setState({
            loadStatus: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return initializePromise;
    },

    retryInitialize(): Promise<void> {
      initializePromise = null;
      return this.initialize();
    },

    enqueueSave(instances: WidgetInstance[]): void {
      pendingInstances = instances;
      if (itemTimer) clearTimeout(itemTimer);
      itemTimer = setTimeout(() => {
        itemTimer = null;
        itemSaveChain = itemSaveChain.then(flushItems);
      }, SAVE_DEBOUNCE_MS);
    },

    enqueueCameraSave(camera: LayoutCamera): void {
      pendingCamera = camera;
      if (cameraTimer) clearTimeout(cameraTimer);
      cameraTimer = setTimeout(() => {
        cameraTimer = null;
        cameraSaveChain = cameraSaveChain.then(flushCamera);
      }, SAVE_DEBOUNCE_MS);
    },

    async waitForPendingSaves(): Promise<void> {
      if (itemTimer) {
        clearTimeout(itemTimer);
        itemTimer = null;
        itemSaveChain = itemSaveChain.then(flushItems);
      }
      if (cameraTimer) {
        clearTimeout(cameraTimer);
        cameraTimer = null;
        cameraSaveChain = cameraSaveChain.then(flushCamera);
      }
      await Promise.all([itemSaveChain, cameraSaveChain]);
    },

    __resetForTests__(): void {
      initializePromise = null;
      if (itemTimer) clearTimeout(itemTimer);
      if (cameraTimer) clearTimeout(cameraTimer);
      itemTimer = cameraTimer = null;
      pendingInstances = pendingCamera = null;
      itemSaveChain = Promise.resolve();
      cameraSaveChain = Promise.resolve();
    },
  };
}
