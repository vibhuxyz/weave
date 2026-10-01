interface Entry<T> {
  readonly atMs: number;
  readonly seq: number;
  readonly item: T;
}

function isBefore<T>(a: Entry<T>, b: Entry<T>): boolean {
  return a.atMs < b.atMs || (a.atMs === b.atMs && a.seq < b.seq);
}

export class EventQueue<T> {
  private readonly heap: Entry<T>[] = [];
  private lastSeq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(atMs: number, item: T): void {
    this.lastSeq += 1;
    this.heap.push({ atMs, seq: this.lastSeq, item });
    this.siftUp(this.heap.length - 1);
  }

  pop(): { readonly atMs: number; readonly item: T } | null {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top === undefined || last === undefined) return null;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return { atMs: top.atMs, item: top.item };
  }

  private siftUp(start: number): void {
    for (let index = start; index > 0; ) {
      const parent = (index - 1) >> 1;
      if (!this.swapIfBefore(index, parent)) return;
      index = parent;
    }
  }

  private siftDown(start: number): void {
    for (let index = start; ; ) {
      const smallest = [2 * index + 1, 2 * index + 2].reduce((best, child) => this.earlier(child, best), index);
      if (smallest === index) return;
      this.swapIfBefore(smallest, index);
      index = smallest;
    }
  }

  private earlier(candidate: number, best: number): number {
    const a = this.heap[candidate];
    const b = this.heap[best];
    return a !== undefined && b !== undefined && isBefore(a, b) ? candidate : best;
  }

  private swapIfBefore(child: number, parent: number): boolean {
    const a = this.heap[child];
    const b = this.heap[parent];
    if (a === undefined || b === undefined || !isBefore(a, b)) return false;
    this.heap[child] = b;
    this.heap[parent] = a;
    return true;
  }
}
