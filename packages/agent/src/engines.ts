import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { ENGINES, DEFAULT_ENGINE_ID, resolveEngineArgs, type EngineDescriptor } from "./engines-registry.ts";

export { ENGINES, DEFAULT_ENGINE_ID, resolveEngineArgs, type EngineDescriptor };

/** Resolution from this file — the workspace. Correct in dev, useless in a bundle. */
const localRequire = createRequire(import.meta.url);

/**
 * Where a packaged app keeps its engines: `<appData>/engines/node_modules/…`.
 *
 * A bundled desktop app has no workspace to resolve against. `import.meta.url`
 * points inside the `.app`'s resources, and there is no `packages/agent` there
 * to `pnpm add` into. So the Tauri shell installs engines into its own data
 * directory and names it here.
 *
 * Unset in dev, where {@link localRequire} is the right answer.
 */
function appDataRequire(): NodeRequire | null {
  const dir = process.env.WEAVE_ENGINES_DIR;
  // `createRequire` only needs a path to anchor on — it is never opened.
  return dir ? createRequire(join(dir, "package.json")) : null;
}

export function getEngine(id: string = DEFAULT_ENGINE_ID): EngineDescriptor {
  const normalizedId = id === "agy" ? "antigravity" : id;
  const engine = ENGINES[normalizedId];
  if (!engine) {
    throw new Error(
      `Unknown engine "${id}". Known: ${Object.keys(ENGINES).join(", ")}`,
    );
  }
  return engine;
}

/**
 * Resolve an engine's executable entry from its own manifest.
 *
 * NOT `require.resolve(pkg)`: a package's `exports["."]` usually points at its
 * library entry, while the ACP server is the *bin*. Reading `bin[binName]` is
 * the only reliable way.
 */
export function resolveEngineEntry(engine: EngineDescriptor): string {
  // App data first. A packaged app must never resolve a workspace copy that
  // happens to be on disk — that is how "works on my machine" ships.
  const appData = appDataRequire();
  const roots = appData ? [appData] : [localRequire];

  let manifestPath: string | null = null;
  let resolver: NodeRequire | null = null;
  for (const root of roots) {
    try {
      manifestPath = root.resolve(`${engine.packageName}/package.json`);
      resolver = root;
      break;
    } catch {
      // Try the next root.
    }
  }

  if (!manifestPath || !resolver) {
    throw new Error(
      `${engine.label} is not installed (${engine.packageName}).` +
        // The `pnpm -F` hint only means something in the workspace. In a
        // packaged app the install goes through the Tauri shell.
        (engine.install && !process.env.WEAVE_ENGINES_DIR
          ? `\n  ${engine.install}`
          : ""),
    );
  }

  const manifest = resolver(manifestPath) as { bin?: Record<string, string> | string };
  const bin = manifest.bin;
  const relative = typeof bin === "string" ? bin : bin?.[engine.binName];
  if (!relative) {
    throw new Error(
      `${engine.packageName} has no bin "${engine.binName}". ` +
        `Check its package.json — the ACP server may be published under a different name.`,
    );
  }
  return resolve(dirname(manifestPath), relative);
}

/**
 * Resolve the Codex CLI executable (native platform binary or JavaScript entry).
 *
 * @agentclientprotocol/codex-acp delegates to an underlying Codex app-server.
 * When `CODEX_PATH` is unset and bare `codex` is not on PATH, spawning fails.
 * This resolver discovers either the platform-specific native binary or
 * @openai/codex/bin/codex.js so that Codex works out of the box.
 */
export function resolveCodexCliEntry(engine?: EngineDescriptor): string {
  if (process.env.CODEX_PATH) {
    return process.env.CODEX_PATH;
  }

  const descriptor = engine ?? getEngine("codex");
  const appData = appDataRequire();
  const roots = appData ? [appData] : [localRequire];

  const targetTriple =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : process.platform === "linux"
      ? process.arch === "arm64"
        ? "aarch64-unknown-linux-musl"
        : "x86_64-unknown-linux-musl"
      : process.platform === "win32"
      ? process.arch === "arm64"
        ? "aarch64-pc-windows-msvc"
        : "x86_64-pc-windows-msvc"
      : null;

  const platformPackage = targetTriple
    ? process.platform === "darwin"
      ? `@openai/codex-darwin-${process.arch}`
      : process.platform === "linux"
      ? `@openai/codex-linux-${process.arch}`
      : process.platform === "win32"
      ? `@openai/codex-win32-${process.arch}`
      : null
    : null;

  for (const root of roots) {
    try {
      const acpManifest = root.resolve(`${descriptor.packageName}/package.json`);
      const acpReq = createRequire(acpManifest);
      const codexManifest = acpReq.resolve("@openai/codex/package.json");
      const codexReq = createRequire(codexManifest);

      // Try platform native binary first
      if (platformPackage && targetTriple) {
        try {
          const pkgJson = codexReq.resolve(`${platformPackage}/package.json`);
          const binName = process.platform === "win32" ? "codex.exe" : "codex";
          const nativeBin = resolve(dirname(pkgJson), "vendor", targetTriple, "bin", binName);
          if (existsSync(nativeBin)) {
            return nativeBin;
          }
        } catch {}
      }

      // Try @openai/codex/bin/codex.js
      try {
        const codexJs = codexReq.resolve("@openai/codex/bin/codex.js");
        if (existsSync(codexJs)) {
          return codexJs;
        }
      } catch {}
    } catch {}
  }

  return "codex";
}

/** Engines whose package is actually present, deduplicated by engine.id. */
export function installedEngines(): EngineDescriptor[] {
  const uniqueEngines = Array.from(
    new Map(Object.values(ENGINES).map((e) => [e.id, e])).values(),
  );
  return uniqueEngines.filter((engine) => {
    try {
      resolveEngineEntry(engine);
      return true;
    } catch {
      return false;
    }
  });
}
