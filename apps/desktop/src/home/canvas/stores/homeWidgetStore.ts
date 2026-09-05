import { create } from "zustand";
import type {
  LayoutCamera,
  LayoutConstraints,
} from "@/home/canvas/layout/layout";
import { markFreshWidgetPlacement } from "../lib/freshWidgetPlacements";
import { isLayoutConstraints } from "../lib/snapToGrid";
import { HOME_WIDGET_CATALOG_BY_ID } from "../widgets/catalog";
import type {
  CanvasBounds,
  MoveWidgetOptions,
  WidgetInstance,
} from "../widgets/types";
import {
  addWidgetMutation,
  bumpZMutation,
  cleanUpWidgetsMutation,
  moveWidgetMutation,
  removeWidgetMutation,
  resizeWidgetMutation,
  updateWidgetStateMutation,
} from "./homeWidgetMutations";
import {
  createHomeWidgetRuntime,
  initialHomeWidgetState,
  type HomeWidgetState,
} from "./homeWidgetRuntime";

/**
 * Adapted from upstream `homeWidgetStore.ts` (923 lines). The mutation core —
 * `applyMutation` guarded by `canMutateWidgets`, feeding `runtime.enqueueSave`
 * — is faithful. The onboarding/experiment/starter-agent actions are dropped
 * for Phase 1.
 */

type PlacementInput = CanvasBounds | LayoutConstraints;

function resolvePlacementBounds(
  bounds?: PlacementInput,
): LayoutConstraints | undefined {
  return isLayoutConstraints(bounds) ? bounds : undefined;
}

function canMutate(state: HomeWidgetStore): boolean {
  return state.loadStatus === "ready" && state.itemRevision !== null;
}

interface HomeWidgetStore extends HomeWidgetState {
  initialize: () => Promise<void>;
  retryInitialize: () => Promise<void>;
  addWidget: (
    type: string,
    x: number,
    y: number,
    state?: Record<string, unknown>,
    bounds?: PlacementInput,
  ) => boolean;
  moveWidget: (
    id: string,
    x: number,
    y: number,
    bounds?: PlacementInput,
    options?: MoveWidgetOptions,
  ) => void;
  resizeWidget: (
    id: string,
    width: number,
    height: number,
    bounds?: PlacementInput,
    options?: MoveWidgetOptions,
  ) => void;
  bumpZ: (id: string) => void;
  removeWidget: (id: string) => void;
  updateWidgetState: (
    id: string,
    state: Record<string, unknown>,
    bounds?: PlacementInput,
  ) => void;
  toggleCleanUpWidgets: (bounds?: PlacementInput) => void;
  saveCamera: (camera: LayoutCamera) => void;
}

export const useHomeWidgetStore = create<HomeWidgetStore>()((set, get) => {
  const runtime = createHomeWidgetRuntime({
    getState: () => get(),
    setState: (patch) => set(patch as Partial<HomeWidgetStore>),
  });

  function applyMutation(
    mutate: (instances: WidgetInstance[]) => WidgetInstance[] | null,
  ): WidgetInstance[] | null {
    const state = get();
    if (!canMutate(state)) return null;
    const next = mutate(state.instances);
    if (!next) return null;
    set({ instances: next });
    runtime.enqueueSave(next);
    return next;
  }

  return {
    ...initialHomeWidgetState,

    initialize: () => runtime.initialize(),
    retryInitialize: () => runtime.retryInitialize(),

    addWidget: (type, x, y, state, bounds) => {
      if (!HOME_WIDGET_CATALOG_BY_ID[type]) return false;
      if (!canMutate(get())) return false;
      const id = crypto.randomUUID();
      const next = applyMutation((instances) =>
        addWidgetMutation(instances, {
          id,
          type,
          x,
          y,
          state,
          bounds: resolvePlacementBounds(bounds),
        }),
      );
      if (next) markFreshWidgetPlacement(id);
      return next !== null;
    },

    moveWidget: (id, x, y, bounds, options) => {
      applyMutation((instances) =>
        moveWidgetMutation(
          instances,
          id,
          x,
          y,
          resolvePlacementBounds(bounds),
          options,
        ),
      );
    },

    resizeWidget: (id, width, height, bounds, options) => {
      applyMutation((instances) =>
        resizeWidgetMutation(
          instances,
          id,
          width,
          height,
          resolvePlacementBounds(bounds),
          options,
        ),
      );
    },

    bumpZ: (id) => {
      applyMutation((instances) => bumpZMutation(instances, id));
    },

    removeWidget: (id) => {
      applyMutation((instances) => removeWidgetMutation(instances, id));
    },

    updateWidgetState: (id, state, bounds) => {
      applyMutation((instances) =>
        updateWidgetStateMutation(
          instances,
          id,
          state,
          resolvePlacementBounds(bounds),
        ),
      );
    },

    toggleCleanUpWidgets: (bounds) => {
      applyMutation((instances) =>
        cleanUpWidgetsMutation(instances, resolvePlacementBounds(bounds)),
      );
    },

    saveCamera: (camera) => {
      const state = get();
      if (!canMutate(state) || state.cameraRevision === null) return;
      set({ camera });
      runtime.enqueueCameraSave(camera);
    },
  };
});
