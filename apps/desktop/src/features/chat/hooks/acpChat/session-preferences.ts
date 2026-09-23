const MODE_KEY_PREFIX = "weave:preferred-mode:";
const MODEL_KEY_PREFIX = "weave:preferred-model:";

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }
}

/** The mode the user last picked for this engine, so new chats open on it. */
export function readPreferredModeId(engineId: string): string | null {
  return readLocalStorage(`${MODE_KEY_PREFIX}${engineId}`);
}

export function writePreferredModeId(engineId: string, modeId: string): void {
  writeLocalStorage(`${MODE_KEY_PREFIX}${engineId}`, modeId);
}

/** The model the user last picked for this engine, so new chats open on it. */
export function readPreferredModel(engineId: string): string | null {
  return readLocalStorage(`${MODEL_KEY_PREFIX}${engineId}`);
}

export function writePreferredModel(engineId: string, value: string): void {
  writeLocalStorage(`${MODEL_KEY_PREFIX}${engineId}`, value);
}
