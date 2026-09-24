import type { RawEmployee } from "../config/index.ts";
import { parseEmployee } from "../config/index.ts";
import { MAX_EMPLOYEES, type Employee, type EmployeeSource, type SkippedEmployee } from "../model/index.ts";
import { mergeRaw } from "./merge-raw.ts";
import type { EmployeeRegistry, OverriddenEmployee } from "./types.ts";

const PRECEDENCE: Readonly<Record<EmployeeSource, number>> = { project: 0, user: 1, builtin: 2 };
const MAX_EXTENDS_DEPTH = 8;
const BUILTIN_LABEL = "(builtin)";

type Resolved = { readonly ok: true; readonly raw: Record<string, unknown> } | { readonly ok: false; readonly reason: string };

function labelOf(entry: RawEmployee): string {
  return entry.sourcePath ?? BUILTIN_LABEL;
}

function byPrecedence(a: RawEmployee, b: RawEmployee): number {
  return PRECEDENCE[a.source] - PRECEDENCE[b.source] || labelOf(a).localeCompare(labelOf(b));
}

function stackById(raws: readonly RawEmployee[], skipped: SkippedEmployee[]): ReadonlyMap<string, readonly RawEmployee[]> {
  const stacks = new Map<string, RawEmployee[]>();
  for (const entry of [...raws].sort(byPrecedence)) {
    const id = entry.raw["id"];
    if (typeof id !== "string") {
      skipped.push({ sourcePath: labelOf(entry), reason: 'missing a string "id"' });
      continue;
    }
    const stack = stacks.get(id) ?? [];
    const sameSource = stack.find((other) => other.source === entry.source);
    if (sameSource) skipped.push({ sourcePath: labelOf(entry), reason: `duplicate id ${id}; kept ${labelOf(sameSource)}` });
    else stacks.set(id, [...stack, entry]);
  }
  return new Map([...stacks.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function resolveExtends(stacks: ReadonlyMap<string, readonly RawEmployee[]>, id: string, depth: number, trail: readonly string[]): Resolved {
  const [entry, ...hidden] = stacks.get(id) ?? [];
  if (!entry) return { ok: false, reason: `extends unknown employee ${id}` };
  return resolveEntry(entry, { stacks, hidden, depth, trail: [...trail, id] });
}

function resolveEntry(entry: RawEmployee, context: { readonly stacks: ReadonlyMap<string, readonly RawEmployee[]>; readonly hidden: readonly RawEmployee[]; readonly depth: number; readonly trail: readonly string[] }): Resolved {
  const parentId = entry.raw["extends"];
  if (parentId === undefined) return { ok: true, raw: { ...entry.raw } };
  if (typeof parentId !== "string") return { ok: false, reason: '"extends" must be an employee id' };
  if (context.depth >= MAX_EXTENDS_DEPTH) return { ok: false, reason: `extends chain deeper than ${MAX_EXTENDS_DEPTH}` };
  const isSelf = parentId === entry.raw["id"];
  if (!isSelf && context.trail.includes(parentId)) return { ok: false, reason: `extends cycle ${[...context.trail, parentId].join(" -> ")}` };
  const [shadowed, ...deeper] = context.hidden;
  const parent = isSelf
    ? shadowed ? resolveEntry(shadowed, { ...context, hidden: deeper, depth: context.depth + 1 }) : { ok: false as const, reason: `extends itself but nothing lower defines ${parentId}` }
    : resolveExtends(context.stacks, parentId, context.depth + 1, context.trail);
  if (!parent.ok) return parent;
  const own = Object.fromEntries(Object.entries(entry.raw).filter(([key]) => key !== "extends"));
  return { ok: true, raw: mergeRaw(parent.raw, own) };
}

function overriddenOf(stacks: ReadonlyMap<string, readonly RawEmployee[]>): readonly OverriddenEmployee[] {
  return [...stacks.entries()].flatMap(([id, [winner, ...hidden]]) =>
    winner ? hidden.map((entry) => ({ id, by: winner.source, hidden: entry.source })) : [],
  );
}

export function buildEmployeeRegistry(raws: readonly RawEmployee[], skippedBefore: readonly SkippedEmployee[] = []): EmployeeRegistry {
  const skipped: SkippedEmployee[] = [...skippedBefore];
  const stacks = stackById(raws, skipped);
  const employees: Employee[] = [];
  for (const [id, [entry, ...hidden]] of stacks) {
    if (!entry) continue;
    if (employees.length >= MAX_EMPLOYEES) {
      skipped.push({ sourcePath: labelOf(entry), reason: `registry already holds ${MAX_EMPLOYEES} employees` });
      continue;
    }
    const resolved = resolveEntry(entry, { stacks, hidden, depth: 0, trail: [id] });
    const parsed = resolved.ok ? parseEmployee(resolved.raw, { source: entry.source, sourcePath: entry.sourcePath }) : { ok: false as const, issues: [resolved.reason] };
    if (parsed.ok) employees.push(parsed.employee);
    else skipped.push({ sourcePath: labelOf(entry), reason: parsed.issues.join("; ") });
  }
  return { employees, byId: new Map(employees.map((employee) => [employee.id, employee])), overridden: overriddenOf(stacks), skipped };
}
