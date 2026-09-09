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
import fuzzies1 from "./assets/characters/fuzzies-1.png";
import fuzzies4 from "./assets/characters/fuzzies-4.png";
import fuzzies7 from "./assets/characters/fuzzies-7.png";
import fuzzies10 from "./assets/characters/fuzzies-10.png";
import fuzzies13 from "./assets/characters/fuzzies-13.png";
import fuzzies16 from "./assets/characters/fuzzies-16.png";
import gloopies1 from "./assets/characters/gloopies-1.png";
import gloopies4 from "./assets/characters/gloopies-4.png";
import gloopies7 from "./assets/characters/gloopies-7.png";
import gloopies10 from "./assets/characters/gloopies-10.png";
import gloopies13 from "./assets/characters/gloopies-13.png";
import gloopies16 from "./assets/characters/gloopies-16.png";
import pollies1 from "./assets/characters/pollies-1.png";
import pollies5 from "./assets/characters/pollies-5.png";
import pollies9 from "./assets/characters/pollies-9.png";
import pollies13 from "./assets/characters/pollies-13.png";
import pollies17 from "./assets/characters/pollies-17.png";
import pollies21 from "./assets/characters/pollies-21.png";

/**
 * The built-in agents get their character assigned, not hashed. With 18
 * characters and six built-ins the DJB2 hash collides — `builtin:builder` and
 * `builtin:reviewer` both landed on gloopies-4 — which reads as a bug on any
 * screen showing them side by side, most visibly the onboarding
 * recommendations. User-created agents still hash, where a collision between
 * two agents the user named themselves is unremarkable.
 */
const CHARACTER_BY_SEED: Record<string, string> = {
  "builtin:builder": gloopies1,
  "builtin:debugger": gloopies10,
  "builtin:reviewer": gloopies4,
  "builtin:generalist": gloopies7,
  "builtin:craftsman": gloopies13,
  "builtin:committer": gloopies16,
};

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

export const CHARACTERS: readonly string[] = Object.values(BY_KEY);

/** The art for a chosen character key, or undefined if the key is unknown. */
export function characterByKey(key: string | undefined): string | undefined {
  return key ? BY_KEY[key] : undefined;
}

/** An assigned character when the seed has one, else DJB2 over the seed. */
export function resolveCharacter(seed: string): string {
  const assigned = CHARACTER_BY_SEED[seed];
  if (assigned) return assigned;

  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return CHARACTERS[Math.abs(hash) % CHARACTERS.length];
}
