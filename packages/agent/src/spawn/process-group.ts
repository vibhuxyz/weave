import { spawnSync } from "node:child_process";

/**
 * `pid ppid` for every process, read once per kill.
 *
 * node-pty's `spawn-helper` calls `setsid()`, so the engine's real work sits in
 * a session of its own and `kill(-pid)` never reaches it — that is how a
 * stopped engine leaves a live `agy`/`claude` behind. Walking the tree is the
 * only way to catch those.
 */
function processTable(): ReadonlyArray<readonly [number, number]> {
  const out = spawnSync("ps", ["-Ao", "pid=,ppid="], { encoding: "utf8" });
  if (out.error || typeof out.stdout !== "string") return [];
  const rows: Array<readonly [number, number]> = [];
  for (const line of out.stdout.split("\n")) {
    const [rawPid, rawPpid] = line.trim().split(/\s+/);
    const pid = Number(rawPid);
    const ppid = Number(rawPpid);
    if (Number.isInteger(pid) && Number.isInteger(ppid) && pid > 0) {
      rows.push([pid, ppid]);
    }
  }
  return rows;
}

/** `root` plus every process below it, deepest last. */
function descendants(table: ReadonlyArray<readonly [number, number]>, root: number): number[] {
  const childrenOf = new Map<number, number[]>();
  for (const [pid, ppid] of table) {
    const siblings = childrenOf.get(ppid);
    if (siblings) siblings.push(pid);
    else childrenOf.set(ppid, [pid]);
  }

  const found: number[] = [];
  const queue = [root];
  const seen = new Set<number>([root]);
  while (queue.length > 0) {
    const pid = queue.shift();
    if (pid === undefined) break;
    found.push(pid);
    for (const child of childrenOf.get(pid) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return found;
}

function kill(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

/**
 * Kill an engine and everything it started. The tree is snapshotted first —
 * once the root dies its children reparent to init and are unfindable.
 */
export function killGroup(pid: number | undefined): void {
  if (!pid || pid <= 0) return;

  const tree = descendants(processTable(), pid);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {}
  for (const child of tree.reverse()) kill(child);
}
