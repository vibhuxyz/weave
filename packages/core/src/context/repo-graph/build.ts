import type { ProjectModel } from "../types.ts";
import { MAX_GRAPH_EDGES, MAX_GRAPH_NODES } from "./constants.ts";
import {
  apiEdges,
  configurationEdges,
  containmentEdges,
  dependencyEdges,
  packageEdges,
  testEdges,
} from "./edges.ts";
import {
  apiNodesOf,
  directoryNodesOf,
  fileNodesOf,
  moduleNodesOf,
  REPOSITORY_ID,
  symbolNodesOf,
  workspaceNode,
} from "./nodes.ts";
import type { GraphEdge, GraphNode, RepositoryGraph } from "./types.ts";

function repositoryNode(model: ProjectModel): GraphNode {
  return {
    id: REPOSITORY_ID,
    kind: "repository",
    name: model.repository.root.split("/").at(-1) ?? model.repository.root,
    file: null,
    line: null,
  };
}

function uniqueNodes(nodes: readonly GraphNode[]): GraphNode[] {
  const byId = new Map<string, GraphNode>();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueEdges(edges: readonly GraphEdge[], known: ReadonlySet<string>): GraphEdge[] {
  const byKey = new Map<string, GraphEdge>();
  for (const edge of edges) {
    if (edge.from === edge.to || !known.has(edge.from) || !known.has(edge.to)) continue;
    const key = `${edge.from}|${edge.kind}|${edge.to}`;
    if (!byKey.has(key)) byKey.set(key, edge);
  }
  return [...byKey.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.kind.localeCompare(b.kind) || a.to.localeCompare(b.to),
  );
}

export function buildRepositoryGraph(model: ProjectModel): RepositoryGraph {
  const workspaces = [...model.applications, ...model.packages];
  const allNodes = uniqueNodes([
    repositoryNode(model),
    ...workspaces.map(workspaceNode),
    ...directoryNodesOf(model),
    ...fileNodesOf(model),
    ...symbolNodesOf(model),
    ...apiNodesOf(model),
    ...moduleNodesOf(model),
  ]);
  const nodes = allNodes.slice(0, MAX_GRAPH_NODES);
  const known = new Set(nodes.map((node) => node.id));
  const knownFiles = new Set(model.files.map((file) => file.path));
  const allEdges = uniqueEdges(
    [
      ...containmentEdges(model),
      ...dependencyEdges(model),
      ...packageEdges(model),
      ...apiEdges(model),
      ...testEdges(model, knownFiles),
      ...configurationEdges(model),
    ],
    known,
  );
  return {
    nodes,
    edges: allEdges.slice(0, MAX_GRAPH_EDGES),
    truncated: allNodes.length > MAX_GRAPH_NODES || allEdges.length > MAX_GRAPH_EDGES,
  };
}
