import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { isNotFound, mapBounded } from "../shared/index.ts";
import type { ProjectModel } from "../context/index.ts";
import { MAX_SNIPPET_BYTES, MAX_SNIPPET_LINES, MAX_SNIPPETS } from "./constants.ts";
import type { CodeSnippet } from "./types.ts";

const READ_CONCURRENCY = 4;

interface SnippetTarget {
  readonly path: string;
  readonly symbol: string;
  readonly startLine: number;
  readonly endLine: number;
}

export function snippetTargets(model: ProjectModel, symbolIds: readonly string[]): readonly SnippetTarget[] {
  const byId = new Map(model.symbols.map((symbol) => [symbol.id, symbol]));
  return symbolIds.slice(0, MAX_SNIPPETS).flatMap((id) => {
    const symbol = byId.get(id);
    if (!symbol) return [];
    const nextLine = model.symbols.filter((other) => other.file === symbol.file && other.line > symbol.line).map((other) => other.line).sort((a, b) => a - b)[0];
    const endLine = Math.min(symbol.line + MAX_SNIPPET_LINES - 1, (nextLine ?? Number.MAX_SAFE_INTEGER) - 1);
    return [{ path: symbol.file, symbol: symbol.name, startLine: symbol.line, endLine }];
  });
}

export function sliceLines(text: string, startLine: number, endLine: number): string {
  const lines = text.split(/\r?\n/).slice(startLine - 1, endLine);
  const joined = lines.join("\n").trimEnd();
  return Buffer.byteLength(joined, "utf8") <= MAX_SNIPPET_BYTES ? joined : `${Buffer.from(joined, "utf8").subarray(0, MAX_SNIPPET_BYTES).toString("utf8")}\n…`;
}

async function readInside(root: string, path: string): Promise<string | null> {
  const realRoot = await realpath(root);
  const real = await realpath(resolve(realRoot, path)).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (!real?.startsWith(`${realRoot}${sep}`)) return null;
  return readFile(real, "utf8");
}

export async function readSnippets(root: string, targets: readonly SnippetTarget[]): Promise<readonly CodeSnippet[]> {
  const read = await mapBounded(targets, READ_CONCURRENCY, async (target) => {
    const text = await readInside(root, target.path);
    return text === null ? null : { path: target.path, symbol: target.symbol, startLine: target.startLine, text: sliceLines(text, target.startLine, target.endLine) };
  });
  return read.filter((snippet): snippet is CodeSnippet => snippet !== null);
}
