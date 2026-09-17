export { getCachedAvatarForRef, getCachedAvatarsForRefs } from "./avatars/cachedAvatarBatch";
export {
  AvatarLibraryError,
  normalizeAvatarLibraryError,
  type AvatarLibraryErrorCode,
} from "./avatars/errors";
export {
  AVATAR_CACHE_WARMED_EVENT,
  AVATAR_CACHED_REF_QUERY_KEY_PREFIX,
  USER_AVATAR_LIBRARY_CHANGED_EVENT,
  avatarCachedRefQueryKey,
  listenAvatarCacheWarmed,
  listenUserAvatarLibraryChanged,
  type AvatarCacheWarmedPayload,
} from "./avatars/events";
export {
  cachedAssetToMedia,
  deleteUserAvatar,
  importUserAvatarDataUrl,
  readCachedAvatarAnimation,
  type CachedAvatarAnimation,
} from "./avatars/media";
export {
  getAvatarCatalog,
  getAvatarLibrarySnapshot,
  getCachedAvatarCollections,
  refreshAvatarCache,
  type AvatarLibrarySnapshot,
} from "./avatars/snapshot";
