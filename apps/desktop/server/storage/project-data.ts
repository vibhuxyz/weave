import { rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { PROJECTS_DIR_NAME } from "./constants.ts";
import type { StorageResult } from "./types.ts";

const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function projectDataDir(weaveHome: string, projectId: string): StorageResult<string> {
  if (!PROJECT_ID_PATTERN.test(projectId)) return { ok: false, reason: `Project id ${projectId} is not a Weave project id` };
  const root = resolve(weaveHome, PROJECTS_DIR_NAME);
  const dir = resolve(root, projectId);
  const inside = relative(root, dir);
  if (inside !== projectId || inside.includes(sep)) return { ok: false, reason: `Project data for ${projectId} is outside ${root}` };
  return { ok: true, value: dir };
}

export async function removeProjectData(weaveHome: string, projectId: string): Promise<StorageResult<null>> {
  const dir = projectDataDir(weaveHome, projectId);
  if (!dir.ok) return dir;
  await rm(dir.value, { recursive: true, force: true });
  return { ok: true, value: null };
}
