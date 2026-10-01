import { MAX_ESTIMATE_ITEMS, MAX_ITEM_CHARS, MAX_ITEM_PATHS, MAX_PATH_CHARS } from "./constants.ts";
import type { ParsedItems, WorkItem } from "./types.ts";

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

function itemOf(raw: unknown, index: number): WorkItem | string {
  const fields = fieldsOf(raw);
  const description = fields?.description;
  const paths = fields?.paths;
  if (typeof description !== "string" || description.trim() === "") return `item ${index + 1} needs a "description"`;
  if (!Array.isArray(paths) || paths.length === 0) return `item ${index + 1} needs "paths": the files or folders it will change`;
  const cleanPaths = paths.filter((path): path is string => typeof path === "string" && path.trim() !== "" && path.length <= MAX_PATH_CHARS);
  if (cleanPaths.length === 0) return `item ${index + 1} has no usable paths`;
  return { description: description.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_CHARS), paths: cleanPaths.slice(0, MAX_ITEM_PATHS) };
}

export function parseWorkItems(raw: unknown): ParsedItems {
  const list = fieldsOf(raw)?.items;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, issue: '"items" must be a non-empty list of { description, paths }' };
  if (list.length > MAX_ESTIMATE_ITEMS) return { ok: false, issue: `at most ${MAX_ESTIMATE_ITEMS} items; group smaller steps together` };
  const parsed = list.map(itemOf);
  const problems = parsed.filter((item): item is string => typeof item === "string");
  if (problems.length > 0) return { ok: false, issue: problems.join("; ") };
  return { ok: true, items: parsed.filter((item): item is WorkItem => typeof item !== "string") };
}
