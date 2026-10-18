import { MAX_BRANCHES } from "../constants.ts";
import { gitText } from "./run-git-stdout.ts";
import type { BranchRef, DiffResult, RefsPayload } from "../types.ts";

const ORIGIN_HEAD = /^origin\/(.+)$/;
const FALLBACK_BRANCHES = ["main", "master", "trunk", "develop"] as const;

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0]?.trim() ?? "";
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const head = await gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!head.ok) return null;
  const name = firstLine(head.value);
  return name && name !== "HEAD" ? name : null;
}

async function hasRef(cwd: string, ref: string): Promise<boolean> {
  const check = await gitText(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return check.ok && firstLine(check.value).length > 0;
}

export async function defaultBranch(cwd: string): Promise<string | null> {
  const symbolic = await gitText(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const fromOrigin = symbolic.ok ? ORIGIN_HEAD.exec(firstLine(symbolic.value))?.[1] : undefined;
  if (fromOrigin && (await hasRef(cwd, fromOrigin))) return fromOrigin;
  for (const name of FALLBACK_BRANCHES) {
    if (await hasRef(cwd, name)) return name;
  }
  return null;
}

export async function listBranches(cwd: string): Promise<readonly BranchRef[]> {
  const listed = await gitText(cwd, [
    "for-each-ref",
    `--count=${String(MAX_BRANCHES)}`,
    "--sort=-committerdate",
    "--format=%(refname:short)%09%(HEAD)",
    "refs/heads",
  ]);
  if (!listed.ok) return [];
  return listed.value
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .flatMap(([name, head]) => (name ? [{ name, isCurrent: head === "*" }] : []));
}

export async function mergeBase(cwd: string, base: string, head: string): Promise<string | null> {
  const found = await gitText(cwd, ["merge-base", base, head]);
  if (!found.ok) return null;
  return firstLine(found.value) || null;
}

export async function readRefs(cwd: string): Promise<DiffResult<RefsPayload>> {
  const inside = await gitText(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || firstLine(inside.value) !== "true") {
    return { ok: false, reason: "This project is not a git repository." };
  }
  const [branch, fallback, branches] = await Promise.all([
    currentBranch(cwd),
    defaultBranch(cwd),
    listBranches(cwd),
  ]);
  return { ok: true, value: { branch, defaultBranch: fallback, branches } };
}
