import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { isNotFound, isRecord, parseJsonBlock } from "../../shared/index.ts";
import { MAX_EMPLOYEE_FILE_BYTES, MAX_EMPLOYEES, type EmployeeSource, type SkippedEmployee } from "../model/index.ts";
import { parseYamlSubset } from "./yaml-subset.ts";

export interface EmployeeDir {
  readonly dir: string;
  readonly source: EmployeeSource;
}

export interface RawEmployee {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly source: EmployeeSource;
  readonly sourcePath: string | null;
}

export interface DiscoveredEmployees {
  readonly raws: readonly RawEmployee[];
  readonly skipped: readonly SkippedEmployee[];
}

type FileRead = { readonly ok: true; readonly raw: RawEmployee } | { readonly ok: false; readonly skipped: SkippedEmployee };

const EXTENSIONS: ReadonlySet<string> = new Set([".yaml", ".yml", ".json"]);

function parseText(path: string, text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: string } {
  return extname(path) === ".json" ? parseJsonBlock(text) : parseYamlSubset(text);
}

async function readEmployeeFile(root: string, path: string, source: EmployeeSource): Promise<FileRead> {
  const resolved = await realpath(path);
  if (!resolved.startsWith(`${root}${sep}`)) return { ok: false, skipped: { sourcePath: path, reason: `resolves outside ${root}` } };
  const info = await stat(resolved);
  if (!info.isFile()) return { ok: false, skipped: { sourcePath: path, reason: "not a regular file" } };
  if (info.size > MAX_EMPLOYEE_FILE_BYTES) return { ok: false, skipped: { sourcePath: path, reason: `${info.size} bytes, over ${MAX_EMPLOYEE_FILE_BYTES}` } };
  const parsed = parseText(path, await readFile(resolved, "utf8"));
  if (!parsed.ok) return { ok: false, skipped: { sourcePath: path, reason: `Cannot parse employee file: ${parsed.issue}` } };
  if (!isRecord(parsed.value)) return { ok: false, skipped: { sourcePath: path, reason: "the file must contain a map of employee fields" } };
  return { ok: true, raw: { raw: parsed.value, source, sourcePath: path } };
}

async function readDir(entry: EmployeeDir): Promise<readonly FileRead[]> {
  const root = await realpath(entry.dir).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (!root) return [];
  const names = (await readdir(root)).filter((name) => EXTENSIONS.has(extname(name).toLowerCase())).sort();
  const tooMany = names.slice(MAX_EMPLOYEES).map((name): FileRead => ({ ok: false, skipped: { sourcePath: join(root, name), reason: `more than ${MAX_EMPLOYEES} employee files in ${root}` } }));
  const reads = await Promise.all(names.slice(0, MAX_EMPLOYEES).map((name) => readEmployeeFile(root, join(root, name), entry.source)));
  return [...reads, ...tooMany];
}

export async function discoverEmployees(dirs: readonly EmployeeDir[]): Promise<DiscoveredEmployees> {
  const reads = (await Promise.all(dirs.map(readDir))).flat();
  return {
    raws: reads.flatMap((read) => (read.ok ? [read.raw] : [])),
    skipped: reads.flatMap((read) => (read.ok ? [] : [read.skipped])),
  };
}
