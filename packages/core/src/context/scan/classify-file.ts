import { ADAPTER_EXTENSIONS } from "../languages/index.ts";
import type { FileKind } from "../types.ts";

const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules", ".git", ".weave", "dist", "build", "out", ".next", ".turbo", "coverage", "target", "vendor", ".cache", "reference",
]);
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|tests?|spec)\/|(^|\/)test_[\w-]+\.py$|_test\.(py|go|rb)$|(^|\/)[\w-]+_spec\.rb$|Test[A-Za-z0-9_]*\.java$|[A-Za-z0-9_]*Test\.java$/;
const MANIFEST_FILE = /(^|\/)(package\.json|tsconfig[\w.-]*\.json|bun\.lock|pnpm-workspace\.yaml)$/;
const CONFIG_FILE = /(^|\/)(\.[\w-]+rc(\.\w+)?|[\w.-]+\.config\.[cm]?[jt]s|\.env[\w.-]*|Dockerfile|docker-compose[\w.-]*\.ya?ml|\.github\/workflows\/[\w.-]+\.ya?ml)$/;
const DOC_FILE = /\.(md|mdx|txt)$/i;

export function isIgnoredPath(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_DIRS.has(segment));
}

const ADAPTER_FILE = new RegExp(`(${ADAPTER_EXTENSIONS.map((extension) => extension.replace(".", "\\.")).join("|")})$`, "i");

export function isParsableSource(path: string): boolean {
  if (ADAPTER_FILE.test(path)) return true;
  return SOURCE_FILE.test(path) && !DECLARATION_FILE.test(path);
}

export function kindOf(path: string): FileKind {
  if (MANIFEST_FILE.test(path)) return "manifest";
  if (isParsableSource(path)) return TEST_FILE.test(path) ? "test" : "source";
  if (CONFIG_FILE.test(path)) return "config";
  if (DOC_FILE.test(path)) return "doc";
  return "other";
}
