import { chmodSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXECUTE_BITS = 0o111;
const NATIVE_ADDON_FILE = "pty.node";
const SPAWN_HELPER_FILE = "spawn-helper";
const PLATFORM_ARCH = `${process.platform}-${process.arch}`;

function isModuleNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND")
  );
}

function nodePtyPackageRoot(): string | null {
  try {
    return dirname(dirname(fileURLToPath(import.meta.resolve("node-pty"))));
  } catch (error) {
    if (isModuleNotFound(error)) return null;
    throw error;
  }
}

function nodePtyNativeDirs(): string[] {
  const dirs = [join(dirname(fileURLToPath(import.meta.url)), "prebuilds", PLATFORM_ARCH)];
  const packageRoot = nodePtyPackageRoot();
  if (packageRoot) {
    dirs.push(
      join(packageRoot, "build", "Release"),
      join(packageRoot, "build", "Debug"),
      join(packageRoot, "prebuilds", PLATFORM_ARCH),
    );
  }
  return dirs;
}

export function ensurePtySpawnHelperExecutable(): void {
  if (process.platform === "win32") return;
  const nativeDir = nodePtyNativeDirs().find((dir) => existsSync(join(dir, NATIVE_ADDON_FILE)));
  if (!nativeDir) return;
  const helper = join(nativeDir, SPAWN_HELPER_FILE);
  if (!existsSync(helper)) return;
  const mode = statSync(helper).mode;
  if ((mode & EXECUTE_BITS) !== 0) return;
  chmodSync(helper, mode | EXECUTE_BITS);
}
