import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";


export const RENDERER_STATS_EVENT = "berd:renderer-stats";

export interface RendererStatsPayload {
  pid: number;
  rssBytes: number;
  rssMb: number;
}

export type RendererLogLevel = "info" | "warn" | "error";


export type RendererLogTarget = "telemetry";

/** Forward a renderer lifecycle event to the backend app log. */
export async function logRendererEvent(
  level: RendererLogLevel,
  message: string,
  target?: RendererLogTarget,
): Promise<void> {
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) {
    return;
  }
  try {
    await invoke("log_renderer_event", { level, message, target });
  } catch {
    // Logging is best-effort; never let it break the UI.
  }
}

/** Subscribe to renderer memory samples emitted by the backend monitor. */
export function listenRendererStats(
  handler: (payload: RendererStatsPayload) => void,
) {
  if (!window.__TAURI_INTERNALS__) {
    return Promise.resolve(() => {});
  }

  return listen<RendererStatsPayload>(RENDERER_STATS_EVENT, (event) =>
    handler(event.payload),
  );
}
