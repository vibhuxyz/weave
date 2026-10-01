/**
 * Bundled Berd character art — a curated subset of the upstream avatar
 * catalog's poster frames, fetched once from the CDN
 * (dwwgwmfqqjotj.cloudfront.net/avatars) and downscaled to 256px. Replaces the
 * procedural blob so agents show real characters on the Home canvas and the
 * Agents page.
 *
 * `resolveCharacter` uses the same DJB2 hash as upstream's `resolveAgentIcon`,
 * so a given agent id always maps to the same character.
 */
import fuzzies1 from "../assets/characters/fuzzies-1.png";
import fuzzies4 from "../assets/characters/fuzzies-4.png";
import fuzzies7 from "../assets/characters/fuzzies-7.png";
import fuzzies10 from "../assets/characters/fuzzies-10.png";
import fuzzies13 from "../assets/characters/fuzzies-13.png";
import fuzzies16 from "../assets/characters/fuzzies-16.png";
import gloopies1 from "../assets/characters/gloopies-1.png";
import gloopies4 from "../assets/characters/gloopies-4.png";
import gloopies7 from "../assets/characters/gloopies-7.png";
import gloopies10 from "../assets/characters/gloopies-10.png";
import gloopies13 from "../assets/characters/gloopies-13.png";
import gloopies16 from "../assets/characters/gloopies-16.png";
import pollies1 from "../assets/characters/pollies-1.png";
import pollies5 from "../assets/characters/pollies-5.png";
import pollies9 from "../assets/characters/pollies-9.png";
import pollies13 from "../assets/characters/pollies-13.png";
import pollies17 from "../assets/characters/pollies-17.png";
import pollies21 from "../assets/characters/pollies-21.png";

const ASSIGNED_KEY_BY_SEED: Record<string, string> = {
  "backend-engineer": "gloopies-1",
  "frontend-engineer": "gloopies-10",
  "devops-engineer": "gloopies-4",
  "qa-engineer": "gloopies-7",
  "security-engineer": "gloopies-13",
  "database-engineer": "gloopies-16",
};

const FALLBACK_CHARACTER_KEY = "gloopies-1";
const DJB2_SEED = 5381;
const DJB2_SHIFT = 5;

/**
 * Every character by a stable key.
 *
 * Agents that pick one store the KEY, never the imported URL: the URL carries
 * a content hash that changes on the next build, which would leave every
 * chosen avatar pointing at a 404 after an update.
 */
const BY_KEY: Record<string, string> = {
  "fuzzies-1": fuzzies1,
  "fuzzies-4": fuzzies4,
  "fuzzies-7": fuzzies7,
  "fuzzies-10": fuzzies10,
  "fuzzies-13": fuzzies13,
  "fuzzies-16": fuzzies16,
  "gloopies-1": gloopies1,
  "gloopies-4": gloopies4,
  "gloopies-7": gloopies7,
  "gloopies-10": gloopies10,
  "gloopies-13": gloopies13,
  "gloopies-16": gloopies16,
  "pollies-1": pollies1,
  "pollies-5": pollies5,
  "pollies-9": pollies9,
  "pollies-13": pollies13,
  "pollies-17": pollies17,
  "pollies-21": pollies21,
};

export const CHARACTER_KEYS: readonly string[] = Object.keys(BY_KEY);

export function characterByKey(key: string | undefined): string | undefined {
  return key ? BY_KEY[key] : undefined;
}

export function characterKeyForSeed(seed: string): string {
  const assigned = ASSIGNED_KEY_BY_SEED[seed];
  if (assigned) return assigned;

  let hash = DJB2_SEED;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << DJB2_SHIFT) + hash + seed.charCodeAt(i)) | 0;
  }
  const key = CHARACTER_KEYS[Math.abs(hash) % CHARACTER_KEYS.length];
  return key ?? FALLBACK_CHARACTER_KEY;
}

export function resolveCharacter(seed: string): string {
  return characterByKey(characterKeyForSeed(seed)) ?? "";
}
