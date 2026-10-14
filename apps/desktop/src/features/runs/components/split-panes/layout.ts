export type SplitAxis = "beside" | "stack";

export type SplitTree<T> =
  | { readonly kind: "pane"; readonly pane: T }
  | { readonly kind: "split"; readonly axis: SplitAxis; readonly nodes: readonly SplitTree<T>[] };

const PANES_PER_ROW = 2;

function beside<T>(panes: readonly T[]): SplitTree<T> | null {
  const only = panes[0];
  if (only === undefined) return null;
  if (panes.length === 1) return { kind: "pane", pane: only };
  return { kind: "split", axis: "beside", nodes: panes.map((pane) => ({ kind: "pane", pane })) };
}

export function splitPanes<T>(panes: readonly T[]): SplitTree<T> | null {
  if (panes.length <= PANES_PER_ROW) return beside(panes);
  const rows: SplitTree<T>[] = [];
  for (let start = 0; start < panes.length; start += PANES_PER_ROW) {
    const row = beside(panes.slice(start, start + PANES_PER_ROW));
    if (row) rows.push(row);
  }
  const first = rows[0];
  if (first === undefined) return null;
  return rows.length === 1 ? first : { kind: "split", axis: "stack", nodes: rows };
}

export function splitId<T>(tree: SplitTree<T>, idOf: (pane: T) => string): string {
  if (tree.kind === "pane") return idOf(tree.pane);
  return tree.nodes.map((node) => splitId(node, idOf)).join("+");
}
