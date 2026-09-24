import { buildProjectModel, updateProjectModel, type ProjectModel } from "@weave/core";
import { createLogger } from "../logging/index.ts";
import { errorMessage } from "../shared/index.ts";
import { MODEL_REFRESH_AFTER_MS } from "./constants.ts";

export type ModelRead = { readonly ok: true; readonly model: ProjectModel } | { readonly ok: false; readonly message: string };

export interface ProjectModelCache {
  readonly read: () => Promise<ModelRead>;
}

export interface ModelCacheOptions {
  readonly projectDir: string;
  readonly dataDir: string;
  readonly now?: () => number;
}

interface ModelSlot {
  readonly read: Promise<ModelRead>;
  readonly builtAt: number;
}

const log = createLogger("project-model");

export function createProjectModelCache(options: ModelCacheOptions): ProjectModelCache {
  const now = options.now ?? Date.now;
  const where = { root: options.projectDir, weaveDir: options.dataDir };
  const build = (previous: ModelRead | null): Promise<ModelRead> =>
    (previous?.ok ? updateProjectModel(previous.model, where) : buildProjectModel(where)).then(
      (built): ModelRead => ({ ok: true, model: built.model }),
      (error: unknown): ModelRead => {
        const message = `Cannot build the project model for ${options.projectDir}: ${errorMessage(error)}`;
        log.error("Project model build failed", { projectDir: options.projectDir, message });
        return { ok: false, message };
      },
    );
  const slot: { current: ModelSlot } = { current: { read: build(null), builtAt: now() } };

  return {
    read: async () => {
      const current = await slot.current.read;
      if (now() - slot.current.builtAt > MODEL_REFRESH_AFTER_MS) slot.current = { read: build(current), builtAt: now() };
      return current;
    },
  };
}
