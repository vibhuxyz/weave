import { invoke } from "@tauri-apps/api/core";
import {
  parseAvatarCatalog,
  type AvatarCatalog,
  type CachedAvatarCollection,
} from "@/shared/avatars";
import { normalizeAvatarLibraryError, type AvatarLibraryErrorCode } from "./errors";

export interface AvatarLibrarySnapshot {
  catalog: AvatarCatalog;
  cachedCollections: CachedAvatarCollection[];
  mediaRefreshing: boolean;
  mediaRefreshCompleted: boolean;
  mediaErrorCode?: AvatarLibraryErrorCode | null;
}

interface RawAvatarLibrarySnapshot {
  catalog: unknown;
  cachedCollections: CachedAvatarCollection[];
  mediaRefreshing: boolean;
  mediaRefreshCompleted: boolean;
  mediaErrorCode?: AvatarLibraryErrorCode | null;
}

export async function getAvatarLibrarySnapshot(): Promise<AvatarLibrarySnapshot> {
  let snapshot: RawAvatarLibrarySnapshot;
  try {
    snapshot = await invoke<RawAvatarLibrarySnapshot>(
      "get_avatar_library_snapshot",
    );
  } catch (error) {
    throw normalizeAvatarLibraryError(error);
  }

  return {
    catalog: parseAvatarCatalog(snapshot.catalog),
    cachedCollections: snapshot.cachedCollections,
    mediaRefreshing: snapshot.mediaRefreshing,
    mediaRefreshCompleted: snapshot.mediaRefreshCompleted,
    mediaErrorCode: snapshot.mediaErrorCode,
  };
}

export async function getAvatarCatalog(): Promise<AvatarCatalog> {
  return (await getAvatarLibrarySnapshot()).catalog;
}

export async function refreshAvatarCache(): Promise<void> {
  try {
    await invoke("refresh_avatar_cache");
  } catch (error) {
    throw normalizeAvatarLibraryError(error);
  }
}

export async function getCachedAvatarCollections(_options?: {
  catalog?: AvatarCatalog;
}): Promise<CachedAvatarCollection[]> {
  return (await getAvatarLibrarySnapshot()).cachedCollections;
}
