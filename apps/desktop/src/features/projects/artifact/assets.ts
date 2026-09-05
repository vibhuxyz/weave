import cubeModelUrl from "./assets/models/Cube_A_v001.gltf?url";
import environmentUrl from "./assets/hdri/studio_soft.exr?url";
import memory19 from "./assets/project-images/memory-19.webp";
import memory20 from "./assets/project-images/memory-20.webp";
import memory21 from "./assets/project-images/memory-21.webp";

export const PROJECT_ARTIFACT_CUBE_MODEL_URL = cubeModelUrl;

/**
 * Upstream Berd streams these from a CDN through the Rust `get_artifacts`
 * command — a versioned catalog with sha256 verification and a 24h cache.
 * That pipeline isn't ported, so the renderer's two asset inputs are bundled
 * through Vite instead and served from the app itself.
 *
 * The environment is the same `studio_soft.exr` upstream ships; it is what the
 * glass shell reflects, so the cube looks flat and unlit without it.
 */
export const PROJECT_ARTIFACT_ENVIRONMENT_URL = environmentUrl;

/**
 * The inner cube's faces. Upstream downloads all 37 `memory-*.webp` images and
 * `selectTileProjectImageUrls` picks 3 for a tile, starting at `seed % 37`.
 * The welcome cube is the only consumer and its seed is fixed at 18, so it
 * always lands on images 19–21 — bundling just those keeps the exact upstream
 * look without carrying the other 34 (~9MB).
 */
export const PROJECT_ARTIFACT_IMAGE_URLS: readonly string[] = [
  memory19,
  memory20,
  memory21,
];
