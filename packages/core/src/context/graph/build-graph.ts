import type { CallEdge, CallFact, DependencyEdge, ExternalPackage, ModuleFacts } from "../types.ts";
import { resolveImport, type ResolveContext } from "./resolve-import.ts";
import type { ResolvedBinding } from "./types.ts";

const MAX_REEXPORT_HOPS = 5;

export interface DependencyGraph {
  readonly internal: readonly DependencyEdge[];
  readonly external: readonly ExternalPackage[];
  readonly calls: readonly CallEdge[];
  readonly unresolved: number;
}

interface ModuleLinks {
  readonly module: ModuleFacts;
  readonly bindings: readonly ResolvedBinding[];
}

function linkModule(module: ModuleFacts, context: ResolveContext, externals: Map<string, Set<string>>): ModuleLinks & { readonly edges: readonly DependencyEdge[]; readonly unresolved: number } {
  const edges = new Map<string, Set<string>>();
  const bindings: ResolvedBinding[] = [];
  let unresolved = 0;
  for (const fact of module.imports) {
    const resolved = resolveImport(module.path, fact.specifier, context);
    if (resolved.kind === "unresolved") unresolved += 1;
    if (resolved.kind === "external") externals.set(resolved.name, (externals.get(resolved.name) ?? new Set()).add(module.path));
    if (resolved.kind !== "internal" || resolved.path === module.path) continue;
    const names = edges.get(resolved.path) ?? new Set<string>();
    for (const binding of fact.bindings) names.add(binding.imported);
    edges.set(resolved.path, names);
    bindings.push(...fact.bindings.map((binding) => ({ ...binding, file: resolved.path })));
  }
  const edgeList = [...edges].map(([to, names]) => ({ from: module.path, to, names: [...names].sort() }));
  return { module, bindings, edges: edgeList, unresolved };
}

function originOf(file: string, name: string, links: ReadonlyMap<string, ModuleLinks>, symbolIds: ReadonlySet<string>, hops = 0): string | null {
  const id = `${file}#${name}`;
  if (symbolIds.has(id)) return id;
  if (hops >= MAX_REEXPORT_HOPS) return null;
  const reexports = links.get(file)?.bindings.filter((binding) => binding.local === name || binding.local === "*") ?? [];
  for (const reexport of reexports) {
    const found = originOf(reexport.file, reexport.imported === "*" ? name : reexport.imported, links, symbolIds, hops + 1);
    if (found) return found;
  }
  return null;
}

function callTarget(link: ModuleLinks, call: CallFact, links: ReadonlyMap<string, ModuleLinks>, symbolIds: ReadonlySet<string>): string | null {
  const [head = "", member] = call.callee.split(".");
  const ownClass = call.caller?.split(".")[0];
  const local = head === "this" && ownClass ? `${link.module.path}#${ownClass}.${member ?? ""}` : `${link.module.path}#${call.callee}`;
  if (symbolIds.has(local)) return local;
  const instance = member ? link.module.instances.find((entry) => entry.local === head) : undefined;
  if (instance) return instanceMethod(link, instance.className, member ?? "", links, symbolIds);
  const binding = link.bindings.find((entry) => entry.local === head);
  if (!binding) return null;
  const name = binding.imported === "*" ? member : binding.imported;
  return name ? originOf(binding.file, name, links, symbolIds) : null;
}

function instanceMethod(link: ModuleLinks, className: string, member: string, links: ReadonlyMap<string, ModuleLinks>, symbolIds: ReadonlySet<string>): string | null {
  const localClass = `${link.module.path}#${className}`;
  const binding = link.bindings.find((entry) => entry.local === className);
  const classId = symbolIds.has(localClass) ? localClass : binding ? originOf(binding.file, binding.imported, links, symbolIds) : null;
  const method = classId ? `${classId}.${member}` : null;
  return method && symbolIds.has(method) ? method : null;
}

export function buildDependencyGraph(modules: readonly ModuleFacts[], context: ResolveContext): DependencyGraph {
  const externals = new Map<string, Set<string>>();
  const linked = modules.map((module) => linkModule(module, context, externals));
  const links = new Map(linked.map((link) => [link.module.path, link]));
  const symbolIds = new Set(modules.flatMap((module) => module.symbols.map((symbol) => symbol.id)));
  const calls = new Map<string, CallEdge>();
  for (const link of linked) {
    for (const call of link.module.calls) {
      const to = callTarget(link, call, links, symbolIds);
      const from = call.caller ? `${link.module.path}#${call.caller}` : link.module.path;
      if (to && to !== from) calls.set(`${from}>${to}`, { from, to });
    }
  }
  return {
    internal: linked.flatMap((link) => link.edges).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    external: [...externals].map(([name, dependents]) => ({ name, dependents: dependents.size })).sort((a, b) => b.dependents - a.dependents || a.name.localeCompare(b.name)),
    calls: [...calls.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    unresolved: linked.reduce((total, link) => total + link.unresolved, 0),
  };
}
