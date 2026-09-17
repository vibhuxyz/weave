export const APP_AVATAR_REF_PREFIX = "app-avatar:" as const;
export const USER_AVATAR_REF_PREFIX = "user-avatar:" as const;

export const USER_AVATAR_COLLECTION_ID = "generated-gloopies" as const;
export const USER_AVATAR_CATALOG_VERSION = "user-generated" as const;

export type AvatarMediaType = "image" | "video";
export type AvatarAlphaMode = "stacked";
export type AvatarAssetFormat = "webm" | "hevc";

export interface AvatarVariant {
  path: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

export interface AvatarCatalogEntry {
  id: string;
  label: string;
  collectionId: string;
  variants: Record<AvatarAssetFormat, AvatarVariant> & {
    poster?: AvatarVariant;
  };
}

export interface ResolvedAvatarMedia {
  src: string;
  mediaType: AvatarMediaType;
  alphaMode?: AvatarAlphaMode;
  posterSrc?: string;
}

export interface AvatarCollection {
  id: string;
  label: string;
  coverAvatarId: string;
  avatarIds: string[];
}

export interface AvatarCatalog {
  schemaVersion: 1;
  catalogVersion: string;
  collections: AvatarCollection[];
  assets: AvatarCatalogEntry[];
}

export interface CachedAvatarAsset {
  id: string;
  path: string;
  mimeType: string;
  alphaMode?: AvatarAlphaMode;
  posterPath?: string;
}

export interface CachedAvatarCollection {
  catalogVersion: string;
  collectionId: string;
  assets: CachedAvatarAsset[];
  failedAssetIds: string[];
  errorCode?: "networkAccess" | "unavailable" | null;
}

export interface CachedAvatar {
  catalogVersion: string;
  collectionId: string;
  asset: CachedAvatarAsset;
}

export const APP_AVATAR_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
