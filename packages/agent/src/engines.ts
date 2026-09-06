import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { ENGINES, DEFAULT_ENGINE_ID, type EngineDescriptor } from "./engines-registry.ts";

export { ENGINES, DEFAULT_ENGINE_ID, type EngineDescriptor };

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
  const engine = ENGINES[id];
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
  const roots = [appDataRequire(), localRequire].filter(
    (candidate): candidate is NodeRequire => candidate !== null,
  );

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

/** Engines whose package is actually present. */
export function installedEngines(): EngineDescriptor[] {
  return Object.values(ENGINES).filter((engine) => {
    try {
      resolveEngineEntry(engine);
      return true;
    } catch {
      return false;
    }
  });
}
