import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { runCommand } from "./run-command.ts";

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".weave", "dist", "build", ".next", "coverage"]);
const PARSE_CHECK_TIMEOUT_MS = 30_000;
const EXPORT_PATTERN =
  /export\s+(?:default|(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/g;
const EXPORT_BRACE_PATTERN = /export\s*\{([^}]*)\}/g;

async function walk(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, root, out);
    } else if (entry.isFile()) {
      out.push(relative(root, full));
    }
  }
  return out;
}

function exportsOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(EXPORT_PATTERN)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name) names.add(name);
  }
  for (const match of source.matchAll(EXPORT_BRACE_PATTERN)) {
    for (const part of (match[1] ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

async function checkParses(cwd: string, sources: string[], problems: string[]): Promise<void> {
  for (const path of sources) {
    const check = await runCommand(
      `node --check ${JSON.stringify(join(cwd, path))}`,
      cwd,
      PARSE_CHECK_TIMEOUT_MS,
    );
    if (!check.ok && /SyntaxError/.test(check.output)) {
      const line = check.output.split("\n").find((l) => l.includes("SyntaxError"));
      problems.push(`${path}: ${line ?? "SyntaxError"}`);
    }
  }
}

async function checkAgainstBaseline(
  cwd: string,
  baseline: string,
  current: string[],
  problems: string[],
  notes: string[],
): Promise<void> {
  const before = await walk(baseline);
  const currentSet = new Set(current);

  for (const path of before) {
    if (!currentSet.has(path)) problems.push(`deleted: ${path}`);
  }

  for (const path of before) {
    if (!SOURCE_EXTENSIONS.has(extname(path)) || !currentSet.has(path)) continue;
    try {
      const [was, now] = await Promise.all([
        readFile(join(baseline, path), "utf8"),
        readFile(join(cwd, path), "utf8"),
      ]);
      const removed = [...exportsOf(was)].filter((name) => !exportsOf(now).has(name));
      if (removed.length > 0) {
        problems.push(`${path}: exports removed — ${removed.join(", ")}`);
      }
    } catch {
      continue;
    }
  }
  notes.push(`compared ${before.length} baseline file(s)`);
}

export async function runDiffReview(
  cwd: string,
  baseline?: string,
): Promise<{ ok: boolean; code: number | null; output: string }> {
  const problems: string[] = [];
  const notes: string[] = [];

  const current = await walk(cwd);
  const sources = current.filter((path) => SOURCE_EXTENSIONS.has(extname(path)));
  await checkParses(cwd, sources, problems);
  notes.push(`parsed ${sources.length} source file(s)`);

  if (baseline) {
    await checkAgainstBaseline(cwd, baseline, current, problems, notes);
  } else {
    notes.push("no baseline: deletion and export checks skipped");
  }

  return {
    ok: problems.length === 0,
    code: problems.length === 0 ? 0 : 1,
    output: [...notes, ...problems].join("\n"),
  };
}
