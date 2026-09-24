const MARKDOWN_FILE = /\.(md|mdx|markdown)$/i;

export function pathSegments(path: string): readonly string[] {
  return path.split(/[\\/]/).filter((segment) => segment.length > 0);
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_FILE.test(path);
}
