import type { CoordinationEvent } from "@weave/protocol";
import type { InboxBatch } from "../mailbox/index.ts";
import { renderEmployeeProtocol } from "./protocol-note.ts";
import { renderInbox } from "./render-inbox.ts";

const LIVE_UPDATE_TYPES: ReadonlySet<CoordinationEvent["type"]> = new Set([
  "artifact.ready",
  "artifact.updated",
  "contract.published",
  "contract.changed",
  "dependency.resolved",
]);

export function hasLiveUpdates(batch: InboxBatch): boolean {
  return batch.events.some((event) => LIVE_UPDATE_TYPES.has(event.type));
}

export function renderBriefing(batch: InboxBatch): string {
  const inbox = renderInbox(batch);
  return [renderEmployeeProtocol(), ...(inbox ? [inbox] : [])].join("\n\n");
}

export function renderUpdateBriefing(batch: InboxBatch): string {
  return [
    "Weave delivered updates from other employees while you worked. Re-check your work against them and finish the task.",
    renderInbox(batch),
  ].join("\n\n");
}
