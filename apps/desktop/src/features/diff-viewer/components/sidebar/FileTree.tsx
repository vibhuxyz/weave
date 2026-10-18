import type { TreeNode } from "../../model";
import { TreeRow } from "./TreeRow";

export function FileTree({
  nodes,
  depth,
  openFolders,
  selectedPath,
  onToggleFolder,
  onSelectFile,
}: {
  readonly nodes: readonly TreeNode[];
  readonly depth: number;
  readonly openFolders: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly onToggleFolder: (path: string) => void;
  readonly onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isOpen = node.kind === "folder" && openFolders.has(node.path);
        return (
          <div key={node.path}>
            <TreeRow
              node={node}
              depth={depth}
              isOpen={isOpen}
              isSelected={node.kind === "file" && node.path === selectedPath}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
            {node.kind === "folder" && isOpen && (
              <FileTree
                nodes={node.children}
                depth={depth + 1}
                openFolders={openFolders}
                selectedPath={selectedPath}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
