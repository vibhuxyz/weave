import { readGitStatus } from "../shared/index.ts";
import { MAX_REPORTED_CHANGES } from "./constants.ts";
import type { ExternalChange, WatchOptions } from "./types.ts";

export async function externalChanges(
  repoRoot: string,
  isOurs: (path: string) => boolean,
): Promise<readonly ExternalChange[]> {
  const status = await readGitStatus(repoRoot);
  return status.changes
    .filter((change) => !isOurs(change.path))
    .map((change) => ({ path: change.path, code: change.code.trim() }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_REPORTED_CHANGES);
}

export function watchExternalChanges(repoRoot: string, options: WatchOptions): () => void {
  const seen = new Set<string>();
  let stopped = false;

  const poll = async (): Promise<void> => {
    if (stopped) return;
    const changes = await externalChanges(repoRoot, options.isOurs);
    const fresh = changes.filter((change) => !seen.has(`${change.code} ${change.path}`));
    for (const change of fresh) seen.add(`${change.code} ${change.path}`);
    if (fresh.length > 0 && !stopped) options.onChange(fresh);
  };

  const timer = setInterval(() => {
    void poll();
  }, options.intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
