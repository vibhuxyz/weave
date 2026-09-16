import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { isInside } from "@weave/agent";
import { IMAGE_MIME, MAX_ATTACHMENT_BYTES } from "./server.constants.ts";

export async function readAttachment(
  projectDir: string,
  path: string,
): Promise<string | null> {
  try {
    const absolute = resolve(projectDir, path);
    if (!isInside(projectDir, absolute)) return null;
    const extension = extname(absolute).toLowerCase();
    const mime = IMAGE_MIME[extension];
    if (!mime) return null;
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_ATTACHMENT_BYTES) return null;
    const bytes = await readFile(absolute);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
