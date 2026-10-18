import { memo } from "react";
import { ChevronDownIcon, ChevronRightIcon, CodeXmlIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import type { TreeNode } from "../../model";
import { StatCounts } from "../StatCounts";

const INDENT_PX = 12;
const BASE_PADDING_PX = 8;

export const TreeRow = memo(function TreeRow({
  node,
  depth,
  isOpen,
  isSelected,
  onToggleFolder,
  onSelectFile,
}: {
  readonly node: TreeNode;
  readonly depth: number;
  readonly isOpen: boolean;
  readonly isSelected: boolean;
  readonly onToggleFolder: (path: string) => void;
  readonly onSelectFile: (path: string) => void;
}) {
  const isFolder = node.kind === "folder";
  const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={() => (isFolder ? onToggleFolder(node.path) : onSelectFile(node.path))}
      aria-expanded={isFolder ? isOpen : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 pr-2 text-left hover:bg-diff-tree-row-hover-bg",
        isSelected && "bg-diff-tree-row-active-bg text-diff-tree-row-active-fg",
      )}
      style={{ paddingLeft: BASE_PADDING_PX + depth * INDENT_PX }}
    >
      {isFolder ? (
        <Chevron className="size-3.5 shrink-0 text-agent-text-faint" />
      ) : (
        <CodeXmlIcon className="size-3.5 shrink-0 text-agent-text-faint" />
      )}
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", isFolder ? "text-agent-text-bright" : "text-agent-text")}>
        {node.name}
      </span>
      <StatCounts additions={node.additions} deletions={node.deletions} className="text-[10px]" />
    </button>
  );
});
