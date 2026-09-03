import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { ENGINES, DEFAULT_ENGINE_ID, type AcpEngine } from "./engines-registry.ts";

export { ENGINES, DEFAULT_ENGINE_ID, type AcpEngine };

const require = createRequire(import.meta.url);

export function getEngine(id: string = DEFAULT_ENGINE_ID): AcpEngine {
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
export function resolveEngineEntry(engine: AcpEngine): string {
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${engine.packageName}/package.json`);
  } catch {
    throw new Error(
      `${engine.label} is not installed (${engine.packageName}).` +
        (engine.install ? `\n  ${engine.install}` : ""),
    );
  }

  const manifest = require(manifestPath) as { bin?: Record<string, string> | string };
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
export function installedEngines(): AcpEngine[] {
  return Object.values(ENGINES).filter((engine) => {
    try {
      resolveEngineEntry(engine);
      return true;
    } catch {
      return false;
    }
  });
}
