import { layerOf } from "../architecture/index.ts";
import type { ProjectFile, ProjectModel, SymbolFact, Workspace } from "../types.ts";
import type { GraphNode, NodeKind } from "./types.ts";

export const REPOSITORY_ID = "repo";

export function directoryIdsOf(path: string): readonly string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_segment, index) => `dir:${segments.slice(0, index + 1).join("/")}`);
}

export function fileId(path: string): string {
  return `file:${path}`;
}

export function symbolId(id: string): string {
  return `symbol:${id}`;
}

function symbolKindOf(symbol: SymbolFact): NodeKind {
  if (symbol.kind === "function") return "function";
  if (symbol.kind === "class") return "class";
  if (symbol.kind === "interface" || symbol.kind === "type" || symbol.kind === "enum") return "schema";
  return "symbol";
}

function fileKindOf(file: ProjectFile): NodeKind {
  if (file.kind === "test") return "test";
  if (file.kind === "config" || file.kind === "manifest") return "configuration";
  if (layerOf(file.path, file.kind) === "data") return "database";
  return "file";
}

export function workspaceNode(workspace: Workspace): GraphNode {
  return {
    id: `package:${workspace.name}`,
    kind: workspace.kind === "application" ? "service" : "package",
    name: workspace.name,
    file: workspace.dir,
    line: null,
  };
}

export function fileNodesOf(model: ProjectModel): readonly GraphNode[] {
  return model.files.map((file) => ({
    id: fileId(file.path),
    kind: fileKindOf(file),
    name: file.path.split("/").at(-1) ?? file.path,
    file: file.path,
    line: null,
  }));
}

export function directoryNodesOf(model: ProjectModel): readonly GraphNode[] {
  const seen = new Map<string, GraphNode>();
  for (const file of model.files) {
    for (const id of directoryIdsOf(file.path)) {
      const path = id.slice("dir:".length);
      if (!seen.has(id)) {
        seen.set(id, { id, kind: "directory", name: path.split("/").at(-1) ?? path, file: path, line: null });
      }
    }
  }
  return [...seen.values()];
}

export function symbolNodesOf(model: ProjectModel): readonly GraphNode[] {
  return model.symbols.map((symbol) => ({
    id: symbolId(symbol.id),
    kind: symbolKindOf(symbol),
    name: symbol.name,
    file: symbol.file,
    line: symbol.line,
  }));
}

export function apiNodesOf(model: ProjectModel): readonly GraphNode[] {
  return model.apis.map((api) => ({
    id: `api:${api.method} ${api.path}`,
    kind: "api" as const,
    name: `${api.method} ${api.path}`,
    file: api.file,
    line: api.line,
  }));
}

export function moduleNodesOf(model: ProjectModel): readonly GraphNode[] {
  return model.dependencies.external.map((external) => ({
    id: `module:${external.name}`,
    kind: "module" as const,
    name: external.name,
    file: null,
    line: null,
  }));
}
