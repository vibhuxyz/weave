import { randomUUID } from "node:crypto";
import type { PermissionOption } from "../shared/index.ts";

export interface PendingPermission {
  readonly requestId: string;
  readonly options: readonly PermissionOption[];
  readonly settle: (optionId: string | null) => void;
}

/**
 * Permission requests the agent is blocked on.
 *
 * The ACP request stays open while the card is on screen — the agent is
 * waiting on our JSON-RPC response, exactly as it would for a human in any
 * other ACP client. Nothing here answers on the user's behalf; it only tracks
 * who is waiting so a cancel can release them.
 */
export class PendingPermissions {
  private readonly waiting = new Map<string, PendingPermission>();

  open(
    options: readonly PermissionOption[],
    settle: (optionId: string | null) => void,
  ): PendingPermission {
    const requestId = randomUUID();
    const entry: PendingPermission = { requestId, options, settle };
    this.waiting.set(requestId, entry);
    return entry;
  }

  /** Answer one request. Unknown ids are stale cards and are ignored. */
  resolve(requestId: string, optionId: string | null): boolean {
    const entry = this.waiting.get(requestId);
    if (!entry) return false;
    this.waiting.delete(requestId);
    entry.settle(optionId);
    return true;
  }

  close(requestId: string): void {
    this.waiting.delete(requestId);
  }

  /** Release everyone still waiting — a cancelled turn, or a dead engine. */
  cancelAll(): readonly string[] {
    const cancelled = [...this.waiting.keys()];
    for (const entry of [...this.waiting.values()]) {
      this.waiting.delete(entry.requestId);
      entry.settle(null);
    }
    return cancelled;
  }

  get size(): number {
    return this.waiting.size;
  }
}
