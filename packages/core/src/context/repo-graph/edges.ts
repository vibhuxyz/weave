import type { ProjectModel } from "../types.ts";
import { directoryIdsOf, fileId, REPOSITORY_ID, symbolId } from "./nodes.ts";
import type { GraphEdge } from "./types.ts";

function testTargetOf(path: string): string {
  return path
    .replace(/(^|\/)(__tests__|tests?|spec)\//, "$1")
    .replace(/\.(test|spec)\.([cm]?[jt]sx?)$/, ".$2")
    .replace(/(^|\/)test_([\w-]+)\.py$/, "$1$2.py")
    .replace(/_test\.(py|go|rb)$/, ".$1")
    .replace(/_spec\.rb$/, ".rb");
}

export function containmentEdges(model: ProjectModel): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const file of model.files) {
    const directories = directoryIdsOf(file.path);
    const parent = directories.at(-1) ?? REPOSITORY_ID;
    edges.push({ from: parent, to: fileId(file.path), kind: "contains" });
    directories.forEach((id, index) => {
      edges.push({ from: index === 0 ? REPOSITORY_ID : (directories[index - 1] ?? REPOSITORY_ID), to: id, kind: "contains" });
    });
  }
  for (const symbol of model.symbols) {
    edges.push({ from: fileId(symbol.file), to: symbolId(symbol.id), kind: "contains" });
  }
  return edges;
}

export function dependencyEdges(model: ProjectModel): readonly GraphEdge[] {
  const imports = model.dependencies.internal.map((edge) => ({
    from: fileId(edge.from),
    to: fileId(edge.to),
    kind: "imports" as const,
  }));
  const calls = model.dependencies.calls.map((edge) => ({
    from: symbolId(edge.from),
    to: symbolId(edge.to),
    kind: "calls" as const,
  }));
  return [...imports, ...calls];
}

export function packageEdges(model: ProjectModel): readonly GraphEdge[] {
  const workspaces = [...model.applications, ...model.packages];
  const byName = new Set(workspaces.map((workspace) => workspace.name));
  const owns = model.files.flatMap((file) =>
    file.workspace && byName.has(file.workspace)
      ? [{ from: `package:${file.workspace}`, to: fileId(file.path), kind: "contains" as const }]
      : [],
  );
  const internal = workspaces.flatMap((workspace) =>
    workspace.internalDependencies
      .filter((name) => byName.has(name))
      .map((name) => ({ from: `package:${workspace.name}`, to: `package:${name}`, kind: "depends_on" as const })),
  );
  const external = model.files.flatMap((file) => {
    const module = model.dependencies.external.find((entry) => entry.name === file.path);
    return module ? [{ from: fileId(file.path), to: `module:${module.name}`, kind: "depends_on" as const }] : [];
  });
  const builds = workspaces.flatMap((workspace) =>
    workspace.entrypoints.map((entry) => ({ from: `package:${workspace.name}`, to: fileId(entry), kind: "builds" as const })),
  );
  return [...owns, ...internal, ...external, ...builds];
}

export function apiEdges(model: ProjectModel): readonly GraphEdge[] {
  return model.apis.map((api) => ({
    from: fileId(api.file),
    to: `api:${api.method} ${api.path}`,
    kind: "generates" as const,
  }));
}

export function testEdges(model: ProjectModel, knownFiles: ReadonlySet<string>): readonly GraphEdge[] {
  return model.files.flatMap((file) => {
    if (file.kind !== "test") return [];
    const target = testTargetOf(file.path);
    return target !== file.path && knownFiles.has(target)
      ? [{ from: fileId(file.path), to: fileId(target), kind: "tests" as const }]
      : [];
  });
}

export function configurationEdges(model: ProjectModel): readonly GraphEdge[] {
  return model.files.flatMap((file) => {
    if (file.kind !== "config" && file.kind !== "manifest") return [];
    const directories = directoryIdsOf(file.path);
    const scope = directories.at(-1) ?? REPOSITORY_ID;
    return [{ from: fileId(file.path), to: scope, kind: "configures" as const }];
  });
}
