import { builtinModules } from "node:module";
import { posix } from "node:path";
import type { PackageManifest, TsPathConfig } from "../workspace/index.ts";

export type ResolvedImport =
  | { readonly kind: "internal"; readonly path: string }
  | { readonly kind: "external"; readonly name: string }
  | { readonly kind: "builtin" }
  | { readonly kind: "unresolved" };

export interface ResolveContext {
  readonly files: ReadonlySet<string>;
  readonly tsPaths: readonly TsPathConfig[];
  readonly packagesByName: ReadonlyMap<string, PackageManifest>;
}

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const JS_TO_TS: Readonly<Record<string, readonly string[]>> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

function candidates(base: string): readonly string[] {
  const extension = posix.extname(base);
  const swapped = (JS_TO_TS[extension] ?? []).map((replacement) => base.slice(0, -extension.length) + replacement);
  return [base, ...swapped, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => `${base}/index${ext}`)];
}

function firstExisting(base: string, files: ReadonlySet<string>): string | null {
  const normalized = posix.normalize(base).replace(/^\.\//, "");
  if (normalized.startsWith("../") || normalized === "..") return null;
  return candidates(normalized).find((candidate) => files.has(candidate)) ?? null;
}

function viaAlias(from: string, specifier: string, context: ResolveContext): string | null {
  const config = context.tsPaths.find((entry) => entry.dir === "." || from.startsWith(`${entry.dir}/`));
  for (const alias of config?.aliases ?? []) {
    const [prefix = "", suffix = ""] = alias.pattern.split("*");
    const isWildcard = alias.pattern.includes("*");
    const matches = isWildcard ? specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length : specifier === alias.pattern;
    if (!matches || !config) continue;
    const captured = isWildcard ? specifier.slice(prefix.length, specifier.length - suffix.length) : "";
    const found = alias.targets.map((target) => firstExisting(posix.join(config.baseDir, target.replace("*", captured)), context.files)).find((path) => path !== null);
    if (found) return found;
  }
  return null;
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? specifier;
}

function viaWorkspacePackage(specifier: string, name: string, manifest: PackageManifest, files: ReadonlySet<string>): string | null {
  const rest = specifier.slice(name.length).replace(/^\//, "");
  const subpath = rest ? `./${rest}` : ".";
  const declared = manifest.exportsMap[subpath] ?? (rest ? null : manifest.entryFields[0] ?? null);
  const targets = [declared, rest ? `src/${rest}` : "src/index", rest || "index"].filter((target): target is string => target !== null);
  return targets.map((target) => firstExisting(posix.join(manifest.dir, target), files)).find((path) => path !== null) ?? null;
}

export function resolveImport(from: string, specifier: string, context: ResolveContext): ResolvedImport {
  if (specifier.startsWith("node:") || BUILTINS.has(specifier)) return { kind: "builtin" };
  if (specifier.startsWith(".")) {
    const path = firstExisting(posix.join(posix.dirname(from), specifier), context.files);
    return path ? { kind: "internal", path } : { kind: "unresolved" };
  }
  const aliased = viaAlias(from, specifier, context);
  if (aliased) return { kind: "internal", path: aliased };
  const name = packageNameOf(specifier);
  const manifest = context.packagesByName.get(name);
  const inWorkspace = manifest ? viaWorkspacePackage(specifier, name, manifest, context.files) : null;
  if (inWorkspace) return { kind: "internal", path: inWorkspace };
  if (specifier.startsWith("/")) return { kind: "unresolved" };
  return { kind: "external", name };
}
