import { parseWithSpec } from "./parse.ts";
import { C_FAMILY, CSHARP, GO, JAVA, PHP, PYTHON, RUBY, RUST } from "./specs/index.ts";
import type { LanguageAdapter, LanguageSpec } from "./types.ts";

const SPECS: readonly LanguageSpec[] = [PYTHON, GO, RUST, JAVA, C_FAMILY, RUBY, PHP, CSHARP];

function adapterOf(spec: LanguageSpec): LanguageAdapter {
  return {
    language: spec.language,
    extensions: spec.extensions,
    parse: (path, text) => parseWithSpec(path, text, spec),
  };
}

const ADAPTER_BY_EXTENSION: ReadonlyMap<string, LanguageAdapter> = new Map(
  SPECS.flatMap((spec) => {
    const adapter = adapterOf(spec);
    return spec.extensions.map((extension) => [extension, adapter] as const);
  }),
);

export const ADAPTER_EXTENSIONS: readonly string[] = [...ADAPTER_BY_EXTENSION.keys()].sort();

function extensionOf(path: string): string {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function adapterFor(path: string): LanguageAdapter | null {
  return ADAPTER_BY_EXTENSION.get(extensionOf(path)) ?? null;
}
