import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import type { WorkerPane } from "../../store";
import { splitId, type SplitTree } from "./layout";
import { WorkerFrame } from "./WorkerFrame";

interface SplitTreeViewProps {
  readonly tree: SplitTree<WorkerPane>;
  readonly projectDir: string | null;
  readonly onOpenDiff?: (turnId: string, path?: string) => void;
  readonly onResume?: (taskId: string) => void;
}

function paneId(pane: WorkerPane): string {
  return pane.taskId;
}

export function SplitTreeView({ tree, projectDir, onOpenDiff, onResume }: SplitTreeViewProps) {
  if (tree.kind === "pane") return <WorkerFrame pane={tree.pane} projectDir={projectDir} onOpenDiff={onOpenDiff} onResume={onResume} />;
  const share = `${Math.floor(100 / tree.nodes.length)}%`;
  const children = tree.nodes.flatMap((node, index) => {
    const id = splitId(node, paneId);
    const panel = (
      <ResizablePanel key={id} id={id} defaultSize={share} minSize="16%" className="min-h-0 overflow-hidden">
        <SplitTreeView tree={node} projectDir={projectDir} onOpenDiff={onOpenDiff} onResume={onResume} />
      </ResizablePanel>
    );
    return index === 0 ? [panel] : [<ResizableHandle key={`${id}-split`} variant="subtle" />, panel];
  });
  return (
    <ResizablePanelGroup orientation={tree.axis === "beside" ? "horizontal" : "vertical"} className="h-full min-h-0">
      {children}
    </ResizablePanelGroup>
  );
}
