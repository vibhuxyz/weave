import type { FileKind, Layer } from "../types.ts";

const LAYER_PATTERNS: readonly (readonly [Layer, RegExp])[] = [
  ["contract", /(^|\/)(contracts?|schemas?|openapi)(\/|\.|$)|\.(contract|schema)\.[cm]?[jt]s$/],
  ["api", /(^|\/)(routes?|controllers?|handlers?|api|endpoints|resolvers)(\/|$)|\.(routes?|controller|handler|resolver)\.[cm]?[jt]s$|(^|\/)route\.[cm]?[jt]s$/],
  ["service", /(^|\/)(services?|domain|use-?cases|jobs|workers?)(\/|$)|\.(service|job|worker)\.[cm]?[jt]s$/],
  ["data", /(^|\/)(repos?|repositories|db|database|models?|migrations|prisma|drizzle)(\/|$)|\.(repo|repository|model|entity)\.[cm]?[jt]s$/],
  ["state", /(^|\/)(hooks|stores?|state)(\/|$)|(^|\/)use-?[A-Za-z-]+\.[jt]sx?$/],
  ["ui", /(^|\/)(components|pages|views|screens|layouts)(\/|$)|\.[jt]sx$/],
];

export function layerOf(path: string, kind: FileKind): Layer {
  if (kind === "test") return "test";
  if (kind === "config" || kind === "manifest") return "config";
  if (kind !== "source") return "other";
  return LAYER_PATTERNS.find(([, pattern]) => pattern.test(path))?.[0] ?? "other";
}
