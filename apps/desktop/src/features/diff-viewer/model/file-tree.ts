import type { FileDiffStatus } from "@/agent/diff";

export interface TreeFile {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly status: FileDiffStatus;
  readonly additions: number;
  readonly deletions: number;
}

export interface TreeFolder {
  readonly kind: "folder";
  readonly name: string;
  readonly path: string;
  readonly children: readonly TreeNode[];
  readonly additions: number;
  readonly deletions: number;
}

export type TreeNode = TreeFolder | TreeFile;

export interface TreeEntry {
  readonly path: string;
  readonly dir: string;
  readonly name: string;
  readonly status: FileDiffStatus;
  readonly additions: number;
  readonly deletions: number;
}

interface Draft {
  readonly folders: Map<string, Draft>;
  readonly files: TreeFile[];
}

function emptyDraft(): Draft {
  return { folders: new Map(), files: [] };
}

function insert(root: Draft, entry: TreeEntry): void {
  const parts = entry.dir ? entry.dir.split("/").filter((part) => part.length > 0) : [];
  let node = root;
  for (const part of parts) {
    const next = node.folders.get(part) ?? emptyDraft();
    node.folders.set(part, next);
    node = next;
  }
  node.files.push({
    kind: "file",
    name: entry.name,
    path: entry.path,
    status: entry.status,
    additions: entry.additions,
    deletions: entry.deletions,
  });
}

function totals(nodes: readonly TreeNode[]): { additions: number; deletions: number } {
  return nodes.reduce(
    (sum, node) => ({ additions: sum.additions + node.additions, deletions: sum.deletions + node.deletions }),
    { additions: 0, deletions: 0 },
  );
}

function build(draft: Draft, prefix: string): readonly TreeNode[] {
  const folders = [...draft.folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => {
      const path = prefix ? `${prefix}/${name}` : name;
      const children = build(child, path);
      return { kind: "folder" as const, name, path, children, ...totals(children) };
    });
  const files = [...draft.files].sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

function collapse(nodes: readonly TreeNode[]): readonly TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "file") return node;
    const children = collapse(node.children);
    const only = children.length === 1 ? children[0] : undefined;
    if (only?.kind === "folder") return { ...only, name: `${node.name}/${only.name}` };
    return { ...node, children };
  });
}

export function buildFileTree(entries: readonly TreeEntry[]): readonly TreeNode[] {
  const root = emptyDraft();
  for (const entry of entries) insert(root, entry);
  return collapse(build(root, ""));
}

export function folderPaths(nodes: readonly TreeNode[]): readonly string[] {
  return nodes.flatMap((node) => (node.kind === "folder" ? [node.path, ...folderPaths(node.children)] : []));
}
