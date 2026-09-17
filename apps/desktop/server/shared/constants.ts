export const DEFAULT_PORT = 8137;

export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export const IMAGE_MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

export const FILE_SEARCH_IGNORE: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  ".turbo",
  "coverage",
]);

export const FILE_SEARCH_MAX_DEPTH = 8;
export const DEFAULT_FILE_SEARCH_LIMIT = 20;