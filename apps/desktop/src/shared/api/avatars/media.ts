import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  mediaTypeFromMimeType,
  type ResolvedAvatarMedia,
} from "@/shared/avatars";

export async function importUserAvatarDataUrl({
  dataUrl,
  alphaMode,
  posterDataUrl,
}: {
  dataUrl: string;
  alphaMode?: "stacked";
  posterDataUrl?: string;
}): Promise<string> {
  return invoke<string>("import_user_avatar_data_url", {
    dataUrl,
    alphaMode,
    posterDataUrl,
  });
}

export async function deleteUserAvatar(avatarRef: string): Promise<void> {
  if (!window.__TAURI_INTERNALS__) {
    return;
  }
  await invoke("delete_user_avatar", { avatarRef });
}

export interface CachedAvatarAnimation {
  bytes: number[];
  mimeType: string;
  alphaMode?: ResolvedAvatarMedia["alphaMode"];
}

export async function readCachedAvatarAnimation({
  avatarRef,
}: {
  avatarRef: string;
}): Promise<CachedAvatarAnimation | null> {
  return invoke<CachedAvatarAnimation | null>("read_cached_avatar_animation", {
    avatarRef,
  });
}

export function cachedAssetToMedia(asset: {
  path: string;
  mimeType: string;
  alphaMode?: ResolvedAvatarMedia["alphaMode"];
  posterPath?: string;
}): ResolvedAvatarMedia {
  const media: ResolvedAvatarMedia = {
    src: convertFileSrc(asset.path, "asset"),
    mediaType: mediaTypeFromMimeType(asset.mimeType),
    ...(asset.posterPath
      ? { posterSrc: convertFileSrc(asset.posterPath, "asset") }
      : {}),
  };
  if (asset.alphaMode) {
    media.alphaMode = asset.alphaMode;
  }
  return media;
}
