import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const NATIVE_FILES = ["pty.node", "spawn-helper"];
const NODE_PTY_ENTRY_SUFFIX = `${sep}node-pty${sep}lib${sep}index.js`;
const EXECUTE_BITS = 0o111;

function nodePtyPackageRoot(bundleInputs) {
  const entry = Object.keys(bundleInputs)
    .sort()
    .find((input) => input.endsWith(NODE_PTY_ENTRY_SUFFIX));
  return entry ? dirname(dirname(resolve(entry))) : null;
}

function nativeSourceDir(packageRoot, platformArch) {
  return [
    join(packageRoot, "prebuilds", platformArch),
    join(packageRoot, "build", "Release"),
  ].find((dir) => existsSync(join(dir, NATIVE_FILES[0])));
}

export function copyPtyNative({ bundleInputs, resourcesDir }) {
  const platformArch = `${process.platform}-${process.arch}`;
  const packageRoot = nodePtyPackageRoot(bundleInputs);
  if (!packageRoot) {
    return { platformArch, copied: [], skipped: "node-pty is not part of the bundle" };
  }

  const sourceDir = nativeSourceDir(packageRoot, platformArch);
  if (!sourceDir) {
    throw new Error(
      `node-pty at ${packageRoot} has no native build for ${platformArch}. The bundled server cannot start without it.`,
    );
  }

  const targetDir = join(resourcesDir, "prebuilds", platformArch);
  mkdirSync(targetDir, { recursive: true });

  const copied = [];
  for (const file of NATIVE_FILES) {
    const source = join(sourceDir, file);
    if (!existsSync(source)) continue;
    const mode = statSync(source).mode;
    copyFileSync(source, join(targetDir, file));
    if ((mode & EXECUTE_BITS) !== 0) chmodSync(join(targetDir, file), mode);
    copied.push(file);
  }

  return { platformArch, copied, targetDir };
}
