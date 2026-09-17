export { getAvatarCatalogEntry, getAvatarCollectionForRef } from "./catalog/lookup";
export { parseAvatarCatalog } from "./catalog/parseCatalog";
export {
  avatarRef,
  isAppAvatarRef,
  isBundledAvatarRef,
  isLibraryAvatarRef,
  isUserAvatarRef,
  mediaTypeFromMimeType,
  parseAvatarRef,
  parseUserAvatarRef,
  userAvatarRef,
} from "./catalog/refs";
export {
  APP_AVATAR_REF_PREFIX,
  USER_AVATAR_CATALOG_VERSION,
  USER_AVATAR_COLLECTION_ID,
  USER_AVATAR_REF_PREFIX,
} from "./catalog/types";
export type {
  AvatarAlphaMode,
  AvatarAssetFormat,
  AvatarCatalog,
  AvatarCatalogEntry,
  AvatarCollection,
  AvatarMediaType,
  AvatarVariant,
  CachedAvatar,
  CachedAvatarAsset,
  CachedAvatarCollection,
  ResolvedAvatarMedia,
} from "./catalog/types";
