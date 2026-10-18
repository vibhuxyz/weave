import { lazy, Suspense } from "react";
import { useShallow } from "zustand/react/shallow";
import { INERT_DIFF_CHANNEL } from "@/features/diff-viewer";
import { useFileStore } from "../store";

const DiffViewer = lazy(() => import("@/features/diff-viewer/components/DiffViewer"));

export function FileViewer() {
  const { openPath, view, isExpanded, close, toggleExpanded } = useFileStore(
    useShallow((state) => ({
      openPath: state.openPath,
      view: state.view,
      isExpanded: state.isExpanded,
      close: state.close,
      toggleExpanded: state.toggleExpanded,
    })),
  );
  if (!openPath || !view) return null;
  return (
    <Suspense fallback={<div className="h-full rounded-xl bg-agent-surface-raised" />}>
      <DiffViewer
        source={{ kind: "file", path: openPath }}
        channel={INERT_DIFF_CHANNEL}
        isExpanded={isExpanded}
        onPickSource={() => {}}
        onToggleExpanded={toggleExpanded}
        onClose={close}
      />
    </Suspense>
  );
}
