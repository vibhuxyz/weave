import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILLS_DIR_NAME } from "./constants.ts";

const SERVER_DIR_DEPTH_IN_DEV = ["..", ".."] as const;

export function bundledSkillsDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const nextToBundle = join(moduleDir, BUNDLED_SKILLS_DIR_NAME);
  if (existsSync(nextToBundle)) return nextToBundle;
  return join(moduleDir, ...SERVER_DIR_DEPTH_IN_DEV, BUNDLED_SKILLS_DIR_NAME);
}
