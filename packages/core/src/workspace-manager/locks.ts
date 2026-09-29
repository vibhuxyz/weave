import type { LockHandle } from "./types.ts";

interface Waiter {
  readonly owner: string;
  readonly paths: readonly string[];
  readonly grant: (handle: LockHandle) => void;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
}

function contains(outer: string, inner: string): boolean {
  return outer === "" || outer === inner || inner.startsWith(`${outer}/`);
}

export function pathsOverlap(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return contains(left, right) || contains(right, left);
}

export class PathLocks {
  private readonly held = new Map<string, readonly string[]>();
  private readonly waiting: Waiter[] = [];

  private conflictsWith(paths: readonly string[], owner: string): readonly string[] {
    const conflicts: string[] = [];
    for (const [holder, heldPaths] of this.held) {
      if (holder === owner) continue;
      for (const held of heldPaths) {
        if (paths.some((path) => pathsOverlap(path, held))) conflicts.push(holder);
      }
    }
    return [...new Set(conflicts)].sort();
  }

  private handleFor(owner: string, paths: readonly string[]): LockHandle {
    let released = false;
    return {
      owner,
      paths,
      release: () => {
        if (released) return;
        released = true;
        this.held.delete(owner);
        this.drain();
      },
    };
  }

  private drain(): void {
    for (let index = 0; index < this.waiting.length; index += 1) {
      const waiter = this.waiting[index];
      if (!waiter || this.conflictsWith(waiter.paths, waiter.owner).length > 0) continue;
      this.waiting.splice(index, 1);
      this.held.set(waiter.owner, waiter.paths);
      waiter.grant(this.handleFor(waiter.owner, waiter.paths));
      return;
    }
  }

  holders(): readonly string[] {
    return [...this.held.keys()].sort();
  }

  tryAcquire(owner: string, paths: readonly string[]): LockHandle | null {
    if (this.conflictsWith(paths, owner).length > 0) return null;
    this.held.set(owner, paths);
    return this.handleFor(owner, paths);
  }

  conflicts(owner: string, paths: readonly string[]): readonly string[] {
    return this.conflictsWith(paths, owner);
  }

  acquire(owner: string, paths: readonly string[]): Promise<LockHandle> {
    const immediate = this.tryAcquire(owner, paths);
    if (immediate) return Promise.resolve(immediate);
    return new Promise<LockHandle>((grant) => {
      this.waiting.push({ owner, paths, grant });
    });
  }
}
