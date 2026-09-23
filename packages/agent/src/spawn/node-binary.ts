import { statSync } from "node:fs";
import { delimiter, join } from "node:path";

const EXECUTE_BITS = 0o111;
const NODE_PATH_OVERRIDE = "WEAVE_NODE_PATH";

/**
 * ACP engines are Node programs. `process.execPath` is only the right launcher
 * when this process is itself Node — under `bun server/index.ts` it is the bun
 * binary, and an engine started that way dies on its own dependencies
 * (agy-acp's ACP SDK cannot resolve `zod/v4` under bun). So the runtime that
 * launches an engine is resolved on its own, never inherited.
 */
function isNodeRuntime(): boolean {
  const versions = process.versions as Record<string, string | undefined>;
  return versions.bun === undefined && versions.deno === undefined;
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    return stat.isFile() && (stat.mode & EXECUTE_BITS) !== 0;
  } catch {
    return false;
  }
}

function nodeCandidates(): string[] {
  const home = process.env.HOME ?? "";
  const fromPath = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, "node"));

  return [
    ...(process.env[NODE_PATH_OVERRIDE] ? [process.env[NODE_PATH_OVERRIDE]] : []),
    ...fromPath,
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    ...(home ? [join(home, ".local", "bin", "node"), join(home, ".volta", "bin", "node")] : []),
  ].filter((path): path is string => Boolean(path));
}

let resolved: string | null = null;

export function resolveNodeBinary(): string {
  if (isNodeRuntime()) return process.execPath;
  if (resolved) return resolved;

  const found = nodeCandidates().find(isExecutableFile);
  if (!found) {
    throw new Error(
      `Weave is running under ${process.versions.bun ? "bun" : "a non-Node runtime"} and could not find a Node binary to start engines with. Install Node, or set ${NODE_PATH_OVERRIDE}.`,
    );
  }
  resolved = found;
  return found;
}
