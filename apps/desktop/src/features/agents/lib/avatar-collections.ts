import { CHARACTER_KEYS, characterKeyForSeed } from "./characters";

const GLOOPIES_KEYS = ["gloopies-1", "gloopies-4", "gloopies-7", "gloopies-10", "gloopies-13", "gloopies-16"] as const;
const FIGGIES_KEYS = ["pollies-1", "pollies-5", "pollies-9", "pollies-13", "pollies-17", "pollies-21"] as const;
const FUZZIES_KEYS = ["fuzzies-1", "fuzzies-4", "fuzzies-7", "fuzzies-10", "fuzzies-13", "fuzzies-16"] as const;

export const DEFAULT_AVATAR_KEY = "gloopies-1";

export const AVATAR_COLLECTIONS = [
  { id: "gloopies", label: "Gloopies", coverKey: "gloopies-1", keys: GLOOPIES_KEYS },
  { id: "figgies", label: "Figgies", coverKey: "pollies-1", keys: FIGGIES_KEYS },
  { id: "fuzzies", label: "Fuzzies", coverKey: "fuzzies-1", keys: FUZZIES_KEYS },
] as const;

export type AvatarCollectionId = (typeof AVATAR_COLLECTIONS)[number]["id"];

const AVATAR_KEYS = new Set<string>(CHARACTER_KEYS);

export function isAvatarKey(key: string): boolean {
  return AVATAR_KEYS.has(key);
}

export function avatarKeyOrDefault(key: string | undefined): string {
  return key && isAvatarKey(key) ? key : DEFAULT_AVATAR_KEY;
}

export function collectionById(id: string) {
  return AVATAR_COLLECTIONS.find((collection) => collection.id === id);
}

interface AvatarHolder {
  readonly id: string;
  readonly createdAt: number;
  readonly character?: string;
  readonly icon?: string;
}

export function displayedAvatarKey(agent: AvatarHolder): string | null {
  if (agent.icon) return null;
  const explicit = agent.character?.trim() ?? "";
  if (explicit && isAvatarKey(explicit)) return explicit;
  return characterKeyForSeed(agent.id);
}

function byAgeThenId(left: AvatarHolder, right: AvatarHolder): number {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function takenAvatarKeys(agents: readonly AvatarHolder[], exceptId: string | null): ReadonlySet<string> {
  const ownerByKey = new Map<string, string>();
  for (const agent of [...agents].sort(byAgeThenId)) {
    const key = displayedAvatarKey(agent);
    if (!key || ownerByKey.has(key)) continue;
    ownerByKey.set(key, agent.id);
  }
  const taken = new Set<string>();
  for (const [key, ownerId] of ownerByKey) {
    if (ownerId !== exceptId) taken.add(key);
  }
  return taken;
}

function firstFreeAvatarKey(taken: ReadonlySet<string>): string | null {
  for (const key of CHARACTER_KEYS) {
    if (!taken.has(key)) return key;
  }
  return null;
}

export function avatarKeyForEdit(current: string | undefined, taken: ReadonlySet<string>, seed?: string): string {
  const key = current?.trim() ?? "";
  if (key && isAvatarKey(key) && !taken.has(key)) return key;
  if (seed) {
    const shown = characterKeyForSeed(seed);
    if (!taken.has(shown)) return shown;
  }
  return firstFreeAvatarKey(taken) ?? DEFAULT_AVATAR_KEY;
}
