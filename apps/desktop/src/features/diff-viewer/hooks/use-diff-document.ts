import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FileDiff } from "@/agent/diff";
import type { DiffChannel } from "../api";
import { COLLAPSE_FILES_THRESHOLD, COLLAPSE_LINES_THRESHOLD, PATCH_BATCH_SIZE } from "../constants";
import { buildFileTree, sourceRange } from "../model";
import type { TreeNode } from "../model";
import { useDiffViewerStore } from "../store";
import type { DiffSource, FileStat, SkippedFile, StatsState } from "../types";

export interface DiffDocument {
  readonly stats: StatsState;
  readonly tree: readonly TreeNode[];
  readonly files: readonly FileStat[];
  readonly skipped: readonly SkippedFile[];
  readonly collapsedFiles: ReadonlySet<string>;
  readonly isLargeDiff: boolean;
  readonly fileFor: (path: string) => FileDiff | undefined;
  readonly isLoading: (path: string) => boolean;
  readonly isMissing: (path: string) => boolean;
}

const NO_FILES: readonly FileStat[] = [];
const NO_SKIPPED: readonly SkippedFile[] = [];

function statsOf(files: readonly FileDiff[]): readonly FileStat[] {
  return files.map((file) => ({
    path: file.path,
    dir: file.dir,
    name: file.name,
    ...(file.oldPath ? { oldPath: file.oldPath } : {}),
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));
}

function isLarge(files: readonly FileStat[]): boolean {
  if (files.length > COLLAPSE_FILES_THRESHOLD) return true;
  const lines = files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  return lines > COLLAPSE_LINES_THRESHOLD;
}

export function useDiffDocument(
  source: DiffSource,
  channel: DiffChannel,
  turnFiles: readonly FileDiff[],
): DiffDocument {
  const { stats, patchByPath, loadingPaths, missingPaths, collapsedFiles } = useDiffViewerStore(
    useShallow((state) => ({
      stats: state.stats,
      patchByPath: state.patchByPath,
      loadingPaths: state.loadingPaths,
      missingPaths: state.missingPaths,
      collapsedFiles: state.collapsedFiles,
    })),
  );

  const range = useMemo(() => sourceRange(source), [source]);
  const isTurn = source.kind === "turn";

  useEffect(() => {
    if (range) channel.requestStats(range);
  }, [channel, range]);

  const effectiveStats: StatsState = useMemo(
    () => (isTurn ? { status: "ready", files: statsOf(turnFiles), skipped: NO_SKIPPED } : stats),
    [isTurn, stats, turnFiles],
  );

  const files = effectiveStats.status === "ready" ? effectiveStats.files : NO_FILES;
  const largeDiff = useMemo(() => isLarge(files), [files]);

  useEffect(() => {
    if (effectiveStats.status !== "ready") return;
    useDiffViewerStore.getState().setCollapsed(largeDiff ? new Set(files.map((file) => file.path)) : new Set());
  }, [effectiveStats.status, files, largeDiff]);

  const askedRef = useRef(new Set<string>());
  useEffect(() => {
    askedRef.current = new Set<string>();
  }, [files]);

  useEffect(() => {
    if (!range || effectiveStats.status !== "ready") return;
    const missing = files
      .map((file) => file.path)
      .filter((path) => !collapsedFiles.has(path) && !patchByPath.has(path) && !askedRef.current.has(path));
    if (missing.length === 0) return;
    for (const path of missing) askedRef.current.add(path);
    for (let at = 0; at < missing.length; at += PATCH_BATCH_SIZE) {
      channel.requestPatch(range, missing.slice(at, at + PATCH_BATCH_SIZE));
    }
  }, [channel, collapsedFiles, effectiveStats.status, files, patchByPath, range]);

  const turnByPath = useMemo(
    () => new Map(turnFiles.map((file) => [file.path, file] as const)),
    [turnFiles],
  );

  const tree = useMemo(() => buildFileTree(files), [files]);

  return useMemo(
    () => ({
      stats: effectiveStats,
      tree,
      files,
      skipped: effectiveStats.status === "ready" ? effectiveStats.skipped : NO_SKIPPED,
      collapsedFiles,
      isLargeDiff: largeDiff,
      fileFor: (path) => (isTurn ? turnByPath.get(path) : patchByPath.get(path)),
      isLoading: (path) => loadingPaths.has(path),
      isMissing: (path) => missingPaths.has(path),
    }),
    [collapsedFiles, effectiveStats, files, isTurn, largeDiff, loadingPaths, missingPaths, patchByPath, tree, turnByPath],
  );
}
