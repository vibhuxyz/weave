import ts from "typescript";
import { dirname, posix } from "node:path";
import type { TsPathAlias, TsPathConfig } from "./types.ts";

interface RawTsConfig {
  readonly baseUrl: string | null;
  readonly paths: readonly TsPathAlias[] | null;
  readonly extendsPath: string | null;
}

function aliasesOf(value: unknown): readonly TsPathAlias[] | null {
  if (typeof value !== "object" || value === null) return null;
  return Object.entries(value)
    .map(([pattern, targets]) => ({ pattern, targets: Array.isArray(targets) ? targets.filter((target): target is string => typeof target === "string") : [] }))
    .filter((alias) => alias.targets.length > 0)
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

function readRaw(path: string, text: string): RawTsConfig | null {
  const parsed = ts.parseConfigFileTextToJson(path, text);
  const config: unknown = parsed.config;
  if (parsed.error || typeof config !== "object" || config === null) return null;
  const record = config as Record<string, unknown>;
  const options = (typeof record.compilerOptions === "object" && record.compilerOptions !== null ? record.compilerOptions : {}) as Record<string, unknown>;
  const extendsValue = typeof record.extends === "string" && record.extends.startsWith(".") ? record.extends : null;
  return {
    baseUrl: typeof options.baseUrl === "string" ? options.baseUrl : null,
    paths: aliasesOf(options.paths),
    extendsPath: extendsValue ? posix.normalize(posix.join(dirname(path), extendsValue.endsWith(".json") ? extendsValue : `${extendsValue}.json`)) : null,
  };
}

export function resolveTsPathConfigs(texts: ReadonlyMap<string, string>): readonly TsPathConfig[] {
  const raws = new Map([...texts].flatMap(([path, text]) => {
    const raw = readRaw(path, text);
    return raw ? [[path, raw] as const] : [];
  }));
  return [...raws]
    .filter(([path]) => posix.basename(path) === "tsconfig.json")
    .flatMap(([path, raw]) => {
      const parent = raw.extendsPath ? raws.get(raw.extendsPath) : undefined;
      const owner = raw.paths ? { raw, file: path } : parent?.paths && raw.extendsPath ? { raw: parent, file: raw.extendsPath } : null;
      if (!owner?.raw.paths) return [];
      const ownerDir = dirname(owner.file);
      const baseDir = posix.normalize(posix.join(ownerDir, owner.raw.baseUrl ?? "."));
      return [{ dir: dirname(path), baseDir, aliases: owner.raw.paths }];
    })
    .sort((a, b) => b.dir.length - a.dir.length || a.dir.localeCompare(b.dir));
}
