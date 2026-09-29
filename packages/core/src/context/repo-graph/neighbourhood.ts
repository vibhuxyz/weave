import { DEFAULT_NEIGHBOURHOOD_DEPTH, MAX_NEIGHBOURHOOD_NODES } from "./constants.ts";
import type { EdgeKind, GraphEdge, GraphNeighbourhood, GraphNode, RepositoryGraph } from "./types.ts";

export interface NeighbourhoodOptions {
  readonly depth?: number;
  readonly maxNodes?: number;
  readonly follow?: readonly EdgeKind[];
}

interface Adjacency {
  readonly byNode: ReadonlyMap<string, readonly GraphEdge[]>;
}

function adjacencyOf(graph: RepositoryGraph, follow: ReadonlySet<EdgeKind> | null): Adjacency {
  const byNode = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (follow && !follow.has(edge.kind)) continue;
    byNode.set(edge.from, [...(byNode.get(edge.from) ?? []), edge]);
    byNode.set(edge.to, [...(byNode.get(edge.to) ?? []), edge]);
  }
  return { byNode };
}

export function neighbourhoodOf(
  graph: RepositoryGraph,
  seeds: readonly string[],
  options: NeighbourhoodOptions = {},
): GraphNeighbourhood {
  const depth = options.depth ?? DEFAULT_NEIGHBOURHOOD_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_NEIGHBOURHOOD_NODES;
  const follow = options.follow ? new Set(options.follow) : null;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = adjacencyOf(graph, follow);

  const visited = new Set<string>();
  const edges = new Map<string, GraphEdge>();
  let frontier = seeds.filter((id) => nodeById.has(id)).sort();
  let reachedLimit = false;

  for (const id of frontier) visited.add(id);

  for (let level = 0; level < depth && frontier.length > 0 && !reachedLimit; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of adjacency.byNode.get(id) ?? []) {
        const other = edge.from === id ? edge.to : edge.from;
        edges.set(`${edge.from}|${edge.kind}|${edge.to}`, edge);
        if (visited.has(other)) continue;
        if (visited.size >= maxNodes) {
          reachedLimit = true;
          break;
        }
        visited.add(other);
        next.push(other);
      }
      if (reachedLimit) break;
    }
    frontier = next.sort();
  }

  const nodes: GraphNode[] = [...visited]
    .flatMap((id) => {
      const node = nodeById.get(id);
      return node ? [node] : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const kept = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: [...edges.values()]
      .filter((edge) => kept.has(edge.from) && kept.has(edge.to))
      .sort((a, b) => a.from.localeCompare(b.from) || a.kind.localeCompare(b.kind) || a.to.localeCompare(b.to)),
    reachedLimit,
  };
}
