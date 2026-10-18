import { topologicalOrder } from "../scheduler/index.ts";
import { isSafeRelativeGlob } from "../shared/relative-paths.ts";
import {
  CLIPPED_MARK,
  HANDOFF_ID_PATTERN,
  MAX_HANDOFF_ITEMS,
  MAX_HANDOFF_ITEM_CHARS,
  MAX_HANDOFF_PATHS,
  MAX_HANDOFF_PATH_CHARS,
} from "./constants.ts";
import type { HandoffItem } from "./types.ts";

export function clip(text: string, maxChars: number): string {
  const characters = [...text.replace(/\s+/g, " ").trim()];
  if (characters.length <= maxChars) return characters.join("");
  return `${characters.slice(0, maxChars - CLIPPED_MARK.length).join("")}${CLIPPED_MARK}`;
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

export function stringItems(raw: unknown, field: string, issues: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push(`${field} must be an array of strings`);
    return [];
  }
  if (raw.length > MAX_HANDOFF_ITEMS) issues.push(`${field} has more than ${MAX_HANDOFF_ITEMS} items`);
  const items: string[] = [];
  for (const [index, item] of raw.slice(0, MAX_HANDOFF_ITEMS).entries()) {
    if (typeof item !== "string" || item.trim() === "") issues.push(`${field}[${index}] must be a non-empty string`);
    else items.push(clip(item, MAX_HANDOFF_ITEM_CHARS));
  }
  return items;
}

function readId(raw: unknown, index: number, seen: Set<string>, issues: string[]): string | null {
  if (typeof raw !== "string" || !HANDOFF_ID_PATTERN.test(raw)) {
    issues.push(`remaining[${index}].id must be lower-case letters, digits or dashes, such as api-health`);
    return null;
  }
  if (seen.has(raw)) {
    issues.push(`remaining[${index}].id "${raw}" is used twice`);
    return null;
  }
  seen.add(raw);
  return raw;
}

function readPaths(raw: unknown, index: number, issues: string[]): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(`remaining[${index}].paths must list the folders this piece changes, such as apps/web`);
    return [];
  }
  if (raw.length > MAX_HANDOFF_PATHS) issues.push(`remaining[${index}].paths has more than ${MAX_HANDOFF_PATHS} entries`);
  const paths: string[] = [];
  for (const entry of raw.slice(0, MAX_HANDOFF_PATHS)) {
    const path = typeof entry === "string" ? entry.trim() : "";
    if (path === "" || path.length > MAX_HANDOFF_PATH_CHARS || !isSafeRelativeGlob(path)) {
      issues.push(`remaining[${index}].paths has an entry that is not a path inside this project: ${JSON.stringify(entry)}`);
      continue;
    }
    paths.push(path);
  }
  return [...new Set(paths)].sort();
}

function readItem(raw: unknown, index: number, seen: Set<string>, issues: string[]): HandoffItem | null {
  const fields = fieldsOf(raw);
  if (fields === null) {
    issues.push(`remaining[${index}] must be an object with id, work, paths and dependsOn`);
    return null;
  }
  const id = readId(fields.id, index, seen, issues);
  const work = typeof fields.work === "string" && fields.work.trim() !== "" ? clip(fields.work, MAX_HANDOFF_ITEM_CHARS) : null;
  if (work === null) issues.push(`remaining[${index}].work must say what this piece of work is`);
  const paths = readPaths(fields.paths, index, issues);
  const dependsOn = stringItems(fields.dependsOn, `remaining[${index}].dependsOn`, issues);
  if (id === null || work === null) return null;
  return { id, work, paths, dependsOn: [...new Set(dependsOn)].sort() };
}

function liftLegacyItem(work: string, index: number): HandoffItem {
  return { id: `t${index + 1}`, work, paths: [], dependsOn: [] };
}

function checkEdges(items: readonly HandoffItem[], issues: string[]): void {
  const known = new Set(items.map((item) => item.id));
  for (const item of items) {
    for (const dependency of item.dependsOn) {
      if (dependency === item.id) issues.push(`remaining item "${item.id}" depends on itself`);
      else if (!known.has(dependency)) issues.push(`remaining item "${item.id}" depends on "${dependency}", which is not in this handoff`);
    }
  }
  if (issues.length > 0) return;
  const ordered = topologicalOrder(items.map((item) => ({ id: item.id, dependencies: item.dependsOn.map((task) => ({ task, requiredOutputs: [] })) })));
  if (ordered.length < items.length) issues.push("the dependsOn edges form a cycle, so no piece can start first");
}

export function readRemaining(raw: unknown, issues: string[]): readonly HandoffItem[] {
  if (!Array.isArray(raw)) {
    issues.push("remaining must be an array of objects with id, work, paths and dependsOn");
    return [];
  }
  if (raw.length > MAX_HANDOFF_ITEMS) issues.push(`remaining has more than ${MAX_HANDOFF_ITEMS} items`);
  const capped = raw.slice(0, MAX_HANDOFF_ITEMS);
  if (capped.every((entry) => typeof entry === "string")) {
    return stringItems(capped, "remaining", issues).map(liftLegacyItem);
  }
  const seen = new Set<string>();
  const items = capped.map((entry, index) => readItem(entry, index, seen, issues)).filter((item): item is HandoffItem => item !== null);
  checkEdges(items, issues);
  return items;
}
