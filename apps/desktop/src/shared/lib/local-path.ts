const SEGMENT = /^[\w.@+-]+$/;
const EXTENSION = /\.([A-Za-z][A-Za-z0-9]{0,9})$/;
const LINE_SUFFIX = /(?::\d+){1,2}$/;
const LIBRARY_NAME = /^[A-Z][a-z]+\.js$/;
const MAX_PATH_CHARS = 300;

const BARE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  "md", "mdx", "txt", "json", "jsonc", "yml", "yaml", "toml", "lock", "env",
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "css", "scss", "html",
  "py", "rs", "go", "rb", "java", "kt", "swift", "c", "h", "cpp", "sh", "sql",
]);

function isBareFileName(name: string, extension: string): boolean {
  return BARE_FILE_EXTENSIONS.has(extension.toLowerCase()) && !LIBRARY_NAME.test(name);
}

export function localFilePathOf(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PATH_CHARS || trimmed.includes("://")) return null;
  const path = trimmed.replace(LINE_SUFFIX, "").replace(/^\.\//, "");
  const segments = path.split("/");
  const isAbsolute = segments[0] === "";
  const named = isAbsolute ? segments.slice(1) : segments;
  if (named.length === 0 || !named.every((segment) => SEGMENT.test(segment) && segment !== "..")) return null;
  const last = named.at(-1) ?? "";
  const extension = EXTENSION.exec(last)?.[1];
  if (!extension) return null;
  if (named.length === 1 && !isAbsolute && !isBareFileName(last, extension)) return null;
  return path;
}
