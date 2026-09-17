import { parseAvatarRef } from "./refs";
import type { AvatarCatalog, AvatarCatalogEntry, AvatarCollection } from "./types";

export function getAvatarCatalogEntry(
  catalog: AvatarCatalog | null | undefined,
  id: string,
): AvatarCatalogEntry | undefined {
  return catalog?.assets.find((entry) => entry.id === id);
}

export function getAvatarCollectionForRef(
  catalog: AvatarCatalog | null | undefined,
  avatarReference: string,
): AvatarCollection | undefined {
  const avatarId = parseAvatarRef(avatarReference);
  if (!avatarId) {
    return undefined;
  }
  return catalog?.collections.find((collection) =>
    collection.avatarIds.includes(avatarId),
  );
}
