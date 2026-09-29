import type { FileChange } from "../../../../server/index.ts";
import type { FileChangeEntry, RunState } from "../types";

export function withFileChange(
  run: RunState,
  taskId: string,
  path: string,
  change: FileChange,
  maxEntries: number,
): Pick<RunState, "files" | "hiddenFileCount"> {
  const existing = run.files.findIndex((entry) => entry.path === path);
  if (existing >= 0) {
    const previous = run.files[existing];
    const kept: FileChangeEntry = {
      path,
      taskId,
      change: previous?.change === "created" && change === "modified" ? "created" : change,
    };
    const files = [...run.files];
    files[existing] = kept;
    return { files, hiddenFileCount: run.hiddenFileCount };
  }
  if (run.files.length >= maxEntries) {
    return { files: run.files, hiddenFileCount: run.hiddenFileCount + 1 };
  }
  return { files: [...run.files, { path, taskId, change }], hiddenFileCount: run.hiddenFileCount };
}
