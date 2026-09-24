import type { Layer, ProjectFile, Workspace, WorkspaceArchitecture } from "../types.ts";
import { layerOf } from "./layer-of.ts";

export function inferArchitecture(workspaces: readonly Workspace[], files: readonly ProjectFile[]): readonly WorkspaceArchitecture[] {
  return workspaces.map((workspace) => {
    const layers: Partial<Record<Layer, number>> = {};
    for (const file of files) {
      if (file.workspace !== workspace.name) continue;
      const layer = layerOf(file.path, file.kind);
      if (layer === "other") continue;
      layers[layer] = (layers[layer] ?? 0) + 1;
    }
    return { workspace: workspace.name, layers, entrypoints: workspace.entrypoints };
  });
}
