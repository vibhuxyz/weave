import { dirname, isAbsolute, join } from "node:path";
import {
  CD_COMMAND,
  DIRECTORY_COMMANDS,
  PARENT_SEGMENT,
  PATH_PART_SEPARATOR,
  UNRESOLVABLE_CD_ARGUMENT,
  WHITESPACE,
} from "./constants.ts";
import { parseShellItems } from "./parse-items.ts";
import { tokenizeShell } from "./tokenize.ts";
import type { DirectoryView, ParentPathUse, ShellItem, ShellJoin } from "./types.ts";

interface StepJoins {
  readonly before: ShellJoin | undefined;
  readonly after: ShellJoin | undefined;
}

function resolvePhysical(base: string, path: string, view: DirectoryView): string {
  const start = isAbsolute(path) ? "/" : view.realPath(base);
  return path.split("/").reduce((current, segment) => {
    if (segment === "" || segment === ".") return current;
    return segment === ".." ? dirname(view.realPath(current)) : join(current, segment);
  }, start);
}

function parentPathTexts(word: string): readonly string[] {
  const parts = word.split(PATH_PART_SEPARATOR);
  const pieces = [...parts, ...parts.flatMap((part) => part.split(WHITESPACE))];
  return [...new Set(pieces)].filter((piece) => PARENT_SEGMENT.test(piece));
}

function usesIn(words: readonly string[], dir: string | null, view: DirectoryView): readonly ParentPathUse[] {
  return words.flatMap((word) => parentPathTexts(word).map((text) => {
    if (isAbsolute(text)) return { text, resolved: resolvePhysical("/", text, view) };
    return { text, resolved: dir === null ? null : resolvePhysical(dir, text, view) };
  }));
}

function changesDirectory(words: readonly string[]): boolean {
  return DIRECTORY_COMMANDS.has(words[0] ?? "");
}

function isMainShellStep(joins: StepJoins): boolean {
  return (joins.before === undefined || joins.before === "and") && (joins.after === undefined || joins.after === "and");
}

function cdTarget(words: readonly string[], dir: string | null, view: DirectoryView): string | null {
  const argument = words[1];
  if (words[0] !== CD_COMMAND || words.length !== 2 || argument === undefined) return null;
  if (UNRESOLVABLE_CD_ARGUMENT.test(argument) || (dir === null && !isAbsolute(argument))) return null;
  return resolvePhysical(dir ?? "/", argument, view);
}

function dirAfter(words: readonly string[], dir: string | null, joins: StepJoins, hasChangedDir: boolean, view: DirectoryView): string | null {
  if (changesDirectory(words)) return isMainShellStep(joins) ? cdTarget(words, dir, view) : null;
  const isUncertain = hasChangedDir && (joins.after === "or" || joins.after === "background");
  return isUncertain ? null : dir;
}

function itemEndDir(item: ShellItem, startDir: string | null, view: DirectoryView): string | null {
  const changers = item.commands.filter(changesDirectory);
  if (changers.length === 0) return startDir;
  const [first] = item.commands;
  const isSingleLeadingCd = changers.length === 1 && first !== undefined && changesDirectory(first);
  if (!isSingleLeadingCd || item.joins.includes("background") || !isMainShellStep({ before: undefined, after: item.joins[0] })) return null;
  const target = cdTarget(first, startDir, view);
  return target !== null && view.isDirectory(target) ? target : null;
}

function walkItem(item: ShellItem, startDir: string | null, view: DirectoryView): { readonly uses: readonly ParentPathUse[]; readonly endDir: string | null } {
  const uses: ParentPathUse[] = [];
  let dir = startDir;
  let hasChangedDir = false;
  for (const [index, words] of item.commands.entries()) {
    uses.push(...usesIn(words, dir, view));
    dir = dirAfter(words, dir, { before: item.joins[index - 1], after: item.joins[index] }, hasChangedDir, view);
    hasChangedDir = hasChangedDir || changesDirectory(words);
  }
  return { uses, endDir: itemEndDir(item, startDir, view) };
}

export function resolveParentPaths(command: string, startDir: string, view: DirectoryView): readonly ParentPathUse[] {
  const uses: ParentPathUse[] = [];
  let dir: string | null = startDir;
  for (const item of parseShellItems(tokenizeShell(command))) {
    const walked = walkItem(item, dir, view);
    uses.push(...walked.uses);
    dir = walked.endDir;
  }
  return uses;
}
