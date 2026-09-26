import type { CoordinationEvent } from "@weave/protocol";
import type { Dependent } from "../dependencies/index.ts";
import type { InboxBatch } from "../mailbox/index.ts";
import { MAX_AWAITED_CONSUMERS, MAX_AWAITED_OUTPUTS } from "./constants.ts";
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

function outputsLine(outputs: readonly string[]): string {
  const shown = outputs.slice(0, MAX_AWAITED_OUTPUTS);
  const hidden = outputs.length - shown.length;
  return `${shown.join(", ")}${hidden > 0 ? ` (+${hidden} more)` : ""}`;
}

export function renderAwaited(awaited: readonly Dependent[]): string {
  const waiting = awaited.filter((dependent) => dependent.requiredOutputs.length > 0);
  if (waiting.length === 0) return "";
  const shown = waiting.slice(0, MAX_AWAITED_CONSUMERS);
  const hidden = waiting.length - shown.length;
  return [
    "These employees cannot start until you publish what they need. Publish it first, before the rest of your task, and name every output in \"provides\":",
    ...shown.map((dependent) => `- ${dependent.consumer} needs: ${outputsLine([...dependent.requiredOutputs])}`),
    ...(hidden > 0 ? [`(+${hidden} more waiting)`] : []),
  ].join("\n");
}

export function renderBriefing(batch: InboxBatch, awaited: readonly Dependent[] = []): string {
  const inbox = renderInbox(batch);
  const waiting = renderAwaited(awaited);
  return [renderEmployeeProtocol(), ...(waiting ? [waiting] : []), ...(inbox ? [inbox] : [])].join("\n\n");
}

export function renderUpdateBriefing(batch: InboxBatch): string {
  return [
    "Weave delivered updates from other employees while you worked. Re-check your work against them and finish the task.",
    renderInbox(batch),
  ].join("\n\n");
}
