import { Suspense, lazy, type MouseEvent, type ReactNode } from "react";
import type { FileDiff } from "@/agent/diff";
import { PlanPanel } from "@/agent/components";
import type { ContextPanelTab } from "@/features/chat/components";
import type { DiffChannel, DiffSource } from "@/features/diff-viewer";
import { cn } from "@/shared/lib";
import type { PlanItem } from "@/features/chat/hooks";

interface ResizeHandle {
  readonly resizing: boolean;
  readonly onResizeStart: (event: MouseEvent) => void;
  readonly onResizeDoubleClick: () => void;
}

const DiffViewer = lazy(() => import("@/features/diff-viewer/components/DiffViewer"));

export function InspectorPanel({
  isOpen,
  width,
  resize,
  diffSource,
  diffChannel,
  turnFiles,
  isDiffExpanded,
  planEntries,
  isPlanOpen,
  isPlanExpanded,
  onPickSource,
  onToggleDiffExpanded,
  onCloseDiff,
  onTogglePlanExpanded,
  onClosePlan,
  children,
}: {
  readonly isOpen: boolean;
  readonly width: number;
  readonly resize: ResizeHandle;
  readonly diffSource: DiffSource | null;
  readonly diffChannel: DiffChannel;
  readonly turnFiles: readonly FileDiff[];
  readonly isDiffExpanded: boolean;
  readonly planEntries: readonly PlanItem[];
  readonly isPlanOpen: boolean;
  readonly isPlanExpanded: boolean;
  readonly onPickSource: (source: DiffSource) => void;
  readonly onToggleDiffExpanded: () => void;
  readonly onCloseDiff: (tab?: ContextPanelTab) => void;
  readonly onTogglePlanExpanded: () => void;
  readonly onClosePlan: () => void;
  readonly children: ReactNode;
}) {
  const hasOverlay = diffSource !== null || isPlanOpen;
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        hasOverlay ? "h-full self-stretch" : "h-fit max-h-full self-start",
        resize.resizing ? "transition-none" : "transition-[width,opacity] duration-200 ease-out",
        isOpen ? "opacity-100" : "w-0 opacity-0",
      )}
      style={isOpen ? { width } : undefined}
    >
      {isOpen && hasOverlay && (
        <div
          onMouseDown={resize.onResizeStart}
          onDoubleClick={resize.onResizeDoubleClick}
          title="Drag to resize · double-click to reset"
          className="group absolute top-0 bottom-0 -left-1.5 z-20 w-3 cursor-ew-resize"
          aria-hidden
        >
          <div className="absolute top-1/2 left-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover:bg-border" />
        </div>
      )}
      <div className={hasOverlay ? "h-full" : "h-fit max-h-full"} style={{ width }}>
        {diffSource ? (
          <Suspense fallback={<div className="h-full rounded-xl bg-agent-surface-raised" />}>
            <DiffViewer
              source={diffSource}
              channel={diffChannel}
              turnFiles={turnFiles}
              isExpanded={isDiffExpanded}
              onPickSource={onPickSource}
              onToggleExpanded={onToggleDiffExpanded}
              onClose={onCloseDiff}
            />
          </Suspense>
        ) : isPlanOpen ? (
          <PlanPanel
            entries={planEntries}
            isExpanded={isPlanExpanded}
            onToggleExpanded={onTogglePlanExpanded}
            onClose={onClosePlan}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
