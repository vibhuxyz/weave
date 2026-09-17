import { readFile, stat, realpath } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { isInside } from "@weave/agent";
import { IMAGE_MIME, MAX_ATTACHMENT_BYTES } from "../shared/index.ts";

function isExpectedFsError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES";
}

export async function readAttachment(
  projectDir: string,
  relativePath: string,
): Promise<string | null> {
  const resolved = resolve(projectDir, relativePath);
  if (!isInside(projectDir, resolved)) return null;

  const extension = extname(resolved).toLowerCase();
  const mime = IMAGE_MIME[extension];
  if (!mime) return null;

  try {
    const real = await realpath(resolved);
    if (!isInside(projectDir, real)) return null;

    const fileStat = await stat(real);
    if (!fileStat.isFile() || fileStat.size > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    const buffer = await readFile(real);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error: unknown) {
    if (isExpectedFsError(error)) return null;
    throw error;
  }
}
