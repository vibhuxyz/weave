import {
  hasDuplicates,
  isDefined,
  isRecord,
  isString,
  parseVariant,
} from "./parseValidators";
import { APP_AVATAR_ID_PATTERN } from "./types";
import type { AvatarCatalog, AvatarCatalogEntry, AvatarCollection } from "./types";

/**
 * Display-label overrides applied on top of the published catalog. The
 * catalog is versioned and republished out-of-band, so a rename would
 * otherwise wait on (and be silently reverted by) catalog pushes; overriding
 * at the parse boundary keeps every surface (overlay wordmark, cards,
 * pickers) consistent. Collection ids never change — existing
 * `app-avatar:pollies-*` refs keep resolving.
 */
const COLLECTION_LABEL_OVERRIDES: Record<string, string> = {
  // Renamed from the "Pollies" placeholder (design direction, Aug 2026).
  // Remove once the published catalog carries the new label.
  pollies: "Figgies",
};

function parseCollection(value: unknown): AvatarCollection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { id, label, coverAvatarId, avatarIds } = value;
  if (
    !isString(id) ||
    !isString(label) ||
    !isString(coverAvatarId) ||
    !APP_AVATAR_ID_PATTERN.test(coverAvatarId) ||
    !Array.isArray(avatarIds) ||
    !avatarIds.every(
      (avatarId) => isString(avatarId) && APP_AVATAR_ID_PATTERN.test(avatarId),
    )
  ) {
    return undefined;
  }

  return {
    id,
    label: COLLECTION_LABEL_OVERRIDES[id] ?? label,
    coverAvatarId,
    avatarIds,
  };
}

function parseAsset(value: unknown): AvatarCatalogEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { id, label, collectionId, variants } = value;
  if (
    !isString(id) ||
    !APP_AVATAR_ID_PATTERN.test(id) ||
    !isString(label) ||
    !isString(collectionId) ||
    !isRecord(variants)
  ) {
    return undefined;
  }

  const webm = parseVariant(variants.webm);
  const hevc = parseVariant(variants.hevc);
  const poster = parseVariant(variants.poster);
  if (!webm || !hevc || (variants.poster !== undefined && !poster)) {
    return undefined;
  }

  return {
    id,
    label,
    collectionId,
    variants: {
      webm,
      hevc,
      ...(poster ? { poster } : {}),
    },
  };
}

export function parseAvatarCatalog(value: unknown): AvatarCatalog {
  if (!isRecord(value)) {
    throw new Error("Avatar catalog must be an object.");
  }

  const { schemaVersion, catalogVersion, collections, assets } = value;
  if (
    schemaVersion !== 1 ||
    !isString(catalogVersion) ||
    !Array.isArray(collections) ||
    !Array.isArray(assets)
  ) {
    throw new Error("Unsupported avatar catalog schema.");
  }

  const parsedCollections = collections.map(parseCollection);
  const parsedAssets = assets.map(parseAsset);
  if (!parsedCollections.every(isDefined) || !parsedAssets.every(isDefined)) {
    throw new Error("Invalid avatar catalog contents.");
  }

  if (
    hasDuplicates(parsedCollections.map((collection) => collection.id)) ||
    hasDuplicates(parsedAssets.map((asset) => asset.id))
  ) {
    throw new Error("Invalid avatar catalog contents.");
  }

  const assetsById = new Map(parsedAssets.map((asset) => [asset.id, asset]));
  for (const collection of parsedCollections) {
    if (hasDuplicates(collection.avatarIds)) {
      throw new Error("Invalid avatar catalog contents.");
    }

    const cover = assetsById.get(collection.coverAvatarId);
    if (!cover || cover.collectionId !== collection.id) {
      throw new Error("Invalid avatar catalog contents.");
    }

    for (const avatarId of collection.avatarIds) {
      const asset = assetsById.get(avatarId);
      if (!asset || asset.collectionId !== collection.id) {
        throw new Error("Invalid avatar catalog contents.");
      }
    }
  }

  return {
    schemaVersion,
    catalogVersion,
    collections: parsedCollections,
    assets: parsedAssets,
  };
}
