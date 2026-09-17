import {
  APP_AVATAR_ID_PATTERN,
  APP_AVATAR_REF_PREFIX,
  USER_AVATAR_REF_PREFIX,
  type AvatarMediaType,
} from "./types";

export function avatarRef(id: string): string {
  return `${APP_AVATAR_REF_PREFIX}${id}`;
}

export function parseAvatarRef(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith(APP_AVATAR_REF_PREFIX)) {
    return undefined;
  }

  const id = trimmed.slice(APP_AVATAR_REF_PREFIX.length);
  return APP_AVATAR_ID_PATTERN.test(id) ? id : undefined;
}

export function isAppAvatarRef(value: string): boolean {
  return parseAvatarRef(value) !== undefined;
}

export const isBundledAvatarRef = isAppAvatarRef;

export function userAvatarRef(id: string): string {
  return `${USER_AVATAR_REF_PREFIX}${id}`;
}

export function parseUserAvatarRef(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith(USER_AVATAR_REF_PREFIX)) {
    return undefined;
  }

  const id = trimmed.slice(USER_AVATAR_REF_PREFIX.length);
  return APP_AVATAR_ID_PATTERN.test(id) ? id : undefined;
}

export function isUserAvatarRef(value: string): boolean {
  return parseUserAvatarRef(value) !== undefined;
}

/**
 * Whether the value references an avatar the library owns — bundled catalog
 * (`app-avatar:`) or user-generated (`user-avatar:`) — as opposed to a custom
 * URL or data URL.
 */
export function isLibraryAvatarRef(value: string): boolean {
  return isAppAvatarRef(value) || isUserAvatarRef(value);
}

export function mediaTypeFromMimeType(mimeType: string): AvatarMediaType {
  return mimeType.toLowerCase().startsWith("video/") ? "video" : "image";
}
