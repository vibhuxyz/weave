import type { ArchiveLoadState } from "../types";

export function archiveLoadState(hasServer: boolean, isLoaded: boolean): ArchiveLoadState {
  if (!hasServer) return "offline";
  return isLoaded ? "ready" : "loading";
}
