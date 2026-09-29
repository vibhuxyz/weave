export const NODE_KINDS = [
  "repository",
  "directory",
  "file",
  "symbol",
  "function",
  "class",
  "module",
  "package",
  "service",
  "api",
  "database",
  "schema",
  "test",
  "configuration",
  "build-target",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_KINDS = [
  "contains",
  "imports",
  "calls",
  "depends_on",
  "implements",
  "tests",
  "builds",
  "references",
  "configures",
  "generates",
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
  readonly file: string | null;
  readonly line: number | null;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
}

export interface RepositoryGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly truncated: boolean;
}

export interface GraphNeighbourhood {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly reachedLimit: boolean;
}
