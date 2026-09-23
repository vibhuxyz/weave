import type { SessionUpdate } from "@weave/protocol";
import type { CompactionController } from "../controller.ts";
import type { CompactableSession } from "../types.ts";

export type EngineScript =
  | { readonly kind: "respond"; readonly updates: readonly SessionUpdate[]; readonly stopReason: string }
  | { readonly kind: "disconnect"; readonly updates: readonly SessionUpdate[]; readonly message: string }
  | { readonly kind: "wait-for-cancel"; readonly updates: readonly SessionUpdate[] };

export type WireEvent =
  | { readonly kind: "engine-prompt"; readonly text: string; readonly stallTimeoutMs: number | undefined }
  | { readonly kind: "engine-update"; readonly update: SessionUpdate };

const CANCELLED_STOP_REASON = "cancelled";

export class FakeEngine implements CompactableSession {
  private readonly scripts: EngineScript[] = [];
  private releaseCancel: (() => void) | null = null;
  readonly sessionId: string;
  private readonly controller: CompactionController;
  private readonly log: (event: WireEvent) => void;

  constructor(sessionId: string, controller: CompactionController, log: (event: WireEvent) => void) {
    this.sessionId = sessionId;
    this.controller = controller;
    this.log = log;
  }

  script(next: EngineScript): this {
    this.scripts.push(next);
    return this;
  }

  emit(update: SessionUpdate, options: { readonly isReplay: boolean } = { isReplay: false }): void {
    this.controller.observe(update, { sessionId: this.sessionId, isReplay: options.isReplay });
    this.log({ kind: "engine-update", update });
  }

  cancel(): void {
    this.releaseCancel?.();
  }

  async prompt(
    blocks: { type: "text"; text: string }[],
    options?: { readonly stallTimeoutMs?: number },
  ): Promise<{ stopReason: string }> {
    this.log({
      kind: "engine-prompt",
      text: blocks.map((block) => block.text).join(""),
      stallTimeoutMs: options?.stallTimeoutMs,
    });
    const next = this.scripts.shift();
    if (!next) throw new Error(`FakeEngine ${this.sessionId} has no script for this prompt`);
    for (const update of next.updates) this.emit(update);
    switch (next.kind) {
      case "respond":
        return { stopReason: next.stopReason };
      case "disconnect":
        throw new Error(next.message);
      case "wait-for-cancel":
        await new Promise<void>((resolve) => {
          this.releaseCancel = resolve;
        });
        return { stopReason: CANCELLED_STOP_REASON };
      default: {
        const exhaustive: never = next;
        return exhaustive;
      }
    }
  }
}
