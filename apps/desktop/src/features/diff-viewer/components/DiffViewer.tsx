import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FileDiff } from "@/agent/diff";
import type { ContextPanelTab } from "@/features/chat/components";
import { useFileStore } from "@/features/files";
import type { DiffChannel } from "../api";
import { useDiffDocument, useGitRefs } from "../hooks";
import { useDiffViewerStore } from "../store";
import type { DiffSource } from "../types";
import { DiffPane } from "./DiffPane";
import { DiffPanelTabs } from "./DiffPanelTabs";
import { ViewerHeader } from "./header";
import { PlainFileView } from "./plain";
import { DiffSidebar } from "./sidebar";
import { DiffEmpty } from "./states";

const NO_FILES: readonly FileDiff[] = [];
const GIT_SOURCE_KINDS: ReadonlySet<DiffSource["kind"]> = new Set(["working", "commit", "range"]);

export default function DiffViewer({
  source,
  channel,
  turnFiles = NO_FILES,
  isExpanded,
  onPickSource,
  onToggleExpanded,
  onClose,
}: {
  readonly source: DiffSource;
  readonly channel: DiffChannel;
  readonly turnFiles?: readonly FileDiff[];
  readonly isExpanded: boolean;
  readonly onPickSource: (source: DiffSource) => void;
  readonly onToggleExpanded: () => void;
  readonly onClose: (tab?: ContextPanelTab) => void;
}) {
  const { sidebarOpen, selectedPath, fileQuery, searchOpen } = useDiffViewerStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
      selectedPath: state.selectedPath,
      fileQuery: state.fileQuery,
      searchOpen: state.searchOpen,
    })),
  );
  const document = useDiffDocument(source, channel, turnFiles);
  const { refs, commits } = useGitRefs(channel, GIT_SOURCE_KINDS.has(source.kind));
  const fileView = useFileStore((state) => state.view);

  const selectFile = useCallback((path: string) => {
    const store = useDiffViewerStore.getState();
    store.selectPath(path);
    const collapsed = new Set(store.collapsedFiles);
    collapsed.delete(path);
    store.setCollapsed(collapsed);
  }, []);

  const isPlainFile = source.kind === "file";

  return (
    <aside className="dark flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised text-agent-text">
      <DiffPanelTabs onSelect={onClose} />
      <ViewerHeader
        refs={refs}
        commits={commits}
        source={source}
        isSidebarOpen={sidebarOpen && !isPlainFile}
        isExpanded={isExpanded}
        isSearchOpen={searchOpen}
        onPickSource={onPickSource}
        onToggleSidebar={useDiffViewerStore.getState().toggleSidebar}
        onToggleSearch={useDiffViewerStore.getState().toggleSearch}
        onToggleExpanded={onToggleExpanded}
        onClose={() => onClose()}
      />
      {searchOpen && !isPlainFile && (
        <input
          type="search"
          autoFocus
          value={fileQuery}
          onChange={(event) => useDiffViewerStore.getState().setFileQuery(event.target.value)}
          placeholder="Filter changed files"
          aria-label="Filter changed files"
          className="mx-3 mb-2 shrink-0 rounded-md bg-agent-surface-hover px-3 py-1.5 text-sm text-agent-text-bright outline-none placeholder:text-agent-text-faint"
        />
      )}
      <div className="flex min-h-0 flex-1">
        {isPlainFile ? (
          fileView ? (
            <PlainFileView path={source.path} view={fileView} />
          ) : (
            <DiffEmpty message="No file is open." />
          )
        ) : (
          <>
            {sidebarOpen && (
              <DiffSidebar
                tree={document.tree}
                commits={commits}
                source={source}
                selectedPath={selectedPath}
                onSelectFile={selectFile}
                onPickSource={onPickSource}
              />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <DiffPane
                document={document}
                source={source}
                channel={channel}
                selectedPath={selectedPath}
                fileQuery={fileQuery}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
