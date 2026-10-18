import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDeferredValue } from "react";
import type { DiffChannel } from "../api";
import type { DiffDocument } from "../hooks";
import { useDiffViewerStore } from "../store";
import type { DiffSource } from "../types";
import { FileSection } from "./file";
import { CollapsedBanner, DiffEmpty, DiffError, DiffLoading, SkippedNotice } from "./states";

export function DiffPane({
  document,
  source,
  channel,
  selectedPath,
  fileQuery,
}: {
  readonly document: DiffDocument;
  readonly source: DiffSource;
  readonly channel: DiffChannel;
  readonly selectedPath: string | null;
  readonly fileQuery: string;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  const deferredQuery = useDeferredValue(fileQuery);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return needle ? document.files.filter((file) => file.path.toLowerCase().includes(needle)) : document.files;
  }, [deferredQuery, document.files]);

  useEffect(() => {
    if (selectedPath) refs.current.get(selectedPath)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedPath, shown]);

  const toggleFile = useCallback((path: string) => useDiffViewerStore.getState().toggleFile(path), []);

  if (document.stats.status === "loading") return <DiffLoading />;
  if (document.stats.status === "error") return <DiffError message={document.stats.message} />;
  if (document.stats.status === "idle") return <DiffEmpty message="Pick something to compare." />;
  if (document.files.length === 0) return <DiffEmpty message="No file changes to show." />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
      {document.isLargeDiff && <CollapsedBanner />}
      <SkippedNotice skipped={document.skipped} />
      {shown.length === 0 && <DiffEmpty message="No changed file matches that search." />}
      {shown.map((stat) => (
        <FileSection
          key={stat.path}
          stat={stat}
          file={document.fileFor(stat.path)}
          source={source}
          channel={channel}
          isOpen={!document.collapsedFiles.has(stat.path)}
          isLoading={document.isLoading(stat.path)}
          isMissing={document.isMissing(stat.path)}
          isSelected={stat.path === selectedPath}
          onToggle={() => toggleFile(stat.path)}
          registerRef={(element) => {
            if (element) refs.current.set(stat.path, element);
            else refs.current.delete(stat.path);
          }}
        />
      ))}
    </div>
  );
}
