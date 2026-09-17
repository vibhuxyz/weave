import { listen } from "@tauri-apps/api/event";

export const AVATAR_CACHE_WARMED_EVENT = "berd:avatar-cache-warmed";
export const USER_AVATAR_LIBRARY_CHANGED_EVENT =
  "berd:user-avatar-library-changed";
export const AVATAR_CACHED_REF_QUERY_KEY_PREFIX = [
  "avatars",
  "cached-ref",
] as const;

export interface AvatarCacheWarmedPayload {
  avatarRefs: string[];
}

export function avatarCachedRefQueryKey(avatarRef: string) {
  return [...AVATAR_CACHED_REF_QUERY_KEY_PREFIX, avatarRef] as const;
}

export function listenAvatarCacheWarmed(
  handler: (payload: AvatarCacheWarmedPayload) => void,
) {
  if (!window.__TAURI_INTERNALS__) {
    return Promise.resolve(() => {});
  }

  return listen<AvatarCacheWarmedPayload>(AVATAR_CACHE_WARMED_EVENT, (event) =>
    handler(event.payload),
  );
}

export function listenUserAvatarLibraryChanged(handler: () => void) {
  if (!window.__TAURI_INTERNALS__) {
    return Promise.resolve(() => {});
  }

  return listen(USER_AVATAR_LIBRARY_CHANGED_EVENT, handler);
}
