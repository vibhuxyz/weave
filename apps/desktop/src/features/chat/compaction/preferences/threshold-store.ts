import { parseAutoCompactThreshold } from "../lib";

const STORAGE_KEY = "weave:auto-compact-threshold";
const CHANGE_EVENT = "weave:auto-compact-threshold-changed";

function isStorageUnavailable(error: unknown): error is DOMException {
  return error instanceof DOMException;
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error: unknown) {
    if (isStorageUnavailable(error)) return null;
    throw error;
  }
}

export function readAutoCompactThreshold(): number {
  return parseAutoCompactThreshold(readRaw());
}

type SaveThresholdResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export function writeAutoCompactThreshold(threshold: number): SaveThresholdResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(threshold));
  } catch (error: unknown) {
    if (!isStorageUnavailable(error)) throw error;
    return { ok: false, message: `Cannot save auto-compact threshold: ${error.message}` };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return { ok: true };
}

export function subscribeAutoCompactThreshold(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
