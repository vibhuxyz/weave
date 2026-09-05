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

export const CHARACTERS: readonly string[] = [
  fuzzies1, fuzzies4, fuzzies7, fuzzies10, fuzzies13, fuzzies16,
  gloopies1, gloopies4, gloopies7, gloopies10, gloopies13, gloopies16,
  pollies1, pollies5, pollies9, pollies13, pollies17, pollies21,
];

/** DJB2 over the seed, modulo the character set — stable per agent. */
export function resolveCharacter(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return CHARACTERS[Math.abs(hash) % CHARACTERS.length];
}
