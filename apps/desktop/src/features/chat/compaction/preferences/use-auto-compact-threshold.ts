import { useSyncExternalStore } from "react";
import { readAutoCompactThreshold, subscribeAutoCompactThreshold } from "./threshold-store";

export function useAutoCompactThreshold(): number {
  return useSyncExternalStore(subscribeAutoCompactThreshold, readAutoCompactThreshold);
}
