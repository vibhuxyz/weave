import type { AvatarVariant } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isSafeRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("\\") || value.includes("\0")) {
    return false;
  }

  return !value
    .split(/[\\/]/)
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

export function parseVariant(value: unknown): AvatarVariant | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { path, mimeType, byteSize, sha256 } = value;
  if (
    !isString(path) ||
    !isSafeRelativePath(path) ||
    !isString(mimeType) ||
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 ||
    !isString(sha256) ||
    !/^[a-f0-9]{64}$/i.test(sha256)
  ) {
    return undefined;
  }

  return { path, mimeType, byteSize, sha256: sha256.toLowerCase() };
}

export function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
