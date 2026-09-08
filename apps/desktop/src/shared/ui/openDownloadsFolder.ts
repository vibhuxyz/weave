import { downloadDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";

/**
 * Open the OS Downloads folder. Only meaningful under Tauri; callers should
 * gate on `window.__TAURI_INTERNALS__` before offering this action.
 */
export async function openDownloadsFolder(): Promise<void> {
  await openPath(await downloadDir());
}
