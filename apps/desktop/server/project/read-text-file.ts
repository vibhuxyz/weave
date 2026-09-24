import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { isInside } from "@weave/agent";

export const MAX_TEXT_FILE_BYTES = 1_000_000;
const BINARY_SNIFF_BYTES = 8_000;

export type TextFileResult =
  | { readonly ok: true; readonly content: string; readonly truncated: boolean }
  | { readonly ok: false; readonly reason: string };

function isExpectedFsError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EISDIR";
}

async function readHead(path: string): Promise<{ readonly bytes: Buffer; readonly size: number } | null> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) return null;
    const length = Math.min(info.size, MAX_TEXT_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return { bytes: buffer.subarray(0, bytesRead), size: info.size };
  } finally {
    await handle.close();
  }
}

export async function readTextFile(projectDir: string, requestedPath: string): Promise<TextFileResult> {
  const notFound = { ok: false, reason: `Cannot open ${requestedPath}: no such file in this project.` } as const;
  try {
    const root = await realpath(projectDir);
    const real = await realpath(resolve(projectDir, requestedPath));
    if (!isInside(root, real)) return { ok: false, reason: `Cannot open ${requestedPath}: it is outside the project.` };
    const head = await readHead(real);
    if (!head) return notFound;
    if (head.bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { ok: false, reason: `Cannot open ${requestedPath}: it is a binary file.` };
    return { ok: true, content: head.bytes.toString("utf8"), truncated: head.size > MAX_TEXT_FILE_BYTES };
  } catch (error: unknown) {
    if (isExpectedFsError(error)) return notFound;
    throw error;
  }
}
