import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { EngineDescriptor } from "./types.ts";
import { appDataRequire } from "./engines.ts";
import { getEngine } from "./engines.ts";

const localRequire = createRequire(import.meta.url);

function getTargetTriple(): string | null {
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64"
      ? "aarch64-unknown-linux-musl"
      : "x86_64-unknown-linux-musl";
  }
  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }
  return null;
}

function getPlatformPackage(): string | null {
  if (process.platform === "darwin") {
    return `@openai/codex-darwin-${process.arch}`;
  }
  if (process.platform === "linux") {
    return `@openai/codex-linux-${process.arch}`;
  }
  if (process.platform === "win32") {
    return `@openai/codex-win32-${process.arch}`;
  }
  return null;
}

function tryFindCodexBinaries(
  root: NodeRequire,
  descriptor: EngineDescriptor,
  platformPackage: string | null,
  targetTriple: string | null,
): string | null {
  try {
    const acpManifest = root.resolve(`${descriptor.packageName}/package.json`);
    const acpReq = createRequire(acpManifest);
    const codexManifest = acpReq.resolve("@openai/codex/package.json");
    const codexReq = createRequire(codexManifest);

    if (platformPackage && targetTriple) {
      try {
        const pkgJson = codexReq.resolve(`${platformPackage}/package.json`);
        const binName = process.platform === "win32" ? "codex.exe" : "codex";
        const nativeBin = resolve(dirname(pkgJson), "vendor", targetTriple, "bin", binName);
        if (existsSync(nativeBin)) return nativeBin;
      } catch {}
    }

    try {
      const codexJs = codexReq.resolve("@openai/codex/bin/codex.js");
      if (existsSync(codexJs)) return codexJs;
    } catch {}
  } catch {}

  return null;
}

export function resolveCodexCliEntry(engine?: EngineDescriptor): string {
  if (process.env.CODEX_PATH) {
    return process.env.CODEX_PATH;
  }

  const descriptor = engine ?? getEngine("codex");
  const appData = appDataRequire();
  const roots = appData ? [appData] : [localRequire];
  const targetTriple = getTargetTriple();
  const platformPackage = getPlatformPackage();

  for (const root of roots) {
    const found = tryFindCodexBinaries(root, descriptor, platformPackage, targetTriple);
    if (found) return found;
  }

  return "codex";
}
