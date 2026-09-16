import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { EngineDescriptor } from "./types.ts";
import { ENGINES, DEFAULT_ENGINE_ID } from "./registry.ts";

const localRequire = createRequire(import.meta.url);

export function appDataRequire(): NodeRequire | null {
  const dir = process.env.WEAVE_ENGINES_DIR;
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

function findManifestPath(
  engine: EngineDescriptor,
  roots: NodeRequire[],
): { manifestPath: string; resolver: NodeRequire } | null {
  for (const root of roots) {
    try {
      const manifestPath = root.resolve(`${engine.packageName}/package.json`);
      return { manifestPath, resolver: root };
    } catch {}
  }
  return null;
}

export function resolveEngineEntry(engine: EngineDescriptor): string {
  const appData = appDataRequire();
  const roots = appData ? [appData] : [localRequire];
  const located = findManifestPath(engine, roots);

  if (!located) {
    const installHint = engine.install && !process.env.WEAVE_ENGINES_DIR
      ? `\n  ${engine.install}`
      : "";
    throw new Error(
      `${engine.label} is not installed (${engine.packageName}).${installHint}`,
    );
  }

  const manifest = located.resolver(located.manifestPath) as {
    bin?: Record<string, string> | string;
  };
  const bin = manifest.bin;
  const relative = typeof bin === "string" ? bin : bin?.[engine.binName];
  if (!relative) {
    throw new Error(
      `${engine.packageName} has no bin "${engine.binName}". ` +
        `Check its package.json — the ACP server may be published under a different name.`,
    );
  }
  return resolve(dirname(located.manifestPath), relative);
}

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
