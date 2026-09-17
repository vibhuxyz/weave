import { useEffect, useSyncExternalStore } from "react";
import {
  getCachedHomeDir,
  getHomeDir,
  subscribeHomeDir,
} from "@/shared/api";

export function useHomeDir(): string | null {
  const homeDir = useSyncExternalStore(subscribeHomeDir, getCachedHomeDir);

  useEffect(() => {
    if (homeDir !== null) {
      return;
    }

    getHomeDir().catch(() => {
     
    });
  }, [homeDir]);

  return homeDir;
}
