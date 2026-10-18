import type { BundledLanguage } from "shiki";

const EXT_LANG: Readonly<Record<string, BundledLanguage>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  mdx: "mdx",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  dockerfile: "docker",
};

const FILENAME_LANG: Readonly<Record<string, BundledLanguage>> = {
  dockerfile: "docker",
  makefile: "make",
};

export const PLAIN_LANGUAGE = "text";

export function languageOf(path: string): BundledLanguage | typeof PLAIN_LANGUAGE {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const byName = FILENAME_LANG[name];
  if (byName) return byName;
  const ext = name.includes(".") ? name.split(".").pop() : undefined;
  return (ext ? EXT_LANG[ext] : undefined) ?? PLAIN_LANGUAGE;
}
