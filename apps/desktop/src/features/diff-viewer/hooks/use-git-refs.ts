import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DiffChannel } from "../api";
import { useDiffViewerStore } from "../store";

export function useGitRefs(channel: DiffChannel, enabled: boolean) {
  const { refs, commits } = useDiffViewerStore(
    useShallow((state) => ({ refs: state.refs, commits: state.commits })),
  );

  useEffect(() => {
    if (enabled) channel.requestRefs();
  }, [channel, enabled]);

  const base = refs?.defaultBranch ?? null;
  useEffect(() => {
    if (enabled && refs) channel.requestCommits(base);
  }, [base, channel, enabled, refs]);

  return { refs, commits };
}
