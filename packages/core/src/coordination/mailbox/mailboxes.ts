import type { CoordinationEvent } from "@weave/protocol";
import { MAX_INBOX_EVENTS } from "./constants.ts";
import type { InboxBatch } from "./types.ts";

interface Inbox {
  events: CoordinationEvent[];
  droppedCount: number;
}

export class Mailboxes {
  private readonly inboxes = new Map<string, Inbox>();

  deliver(recipient: string, event: CoordinationEvent): void {
    const inbox = this.inboxes.get(recipient) ?? { events: [], droppedCount: 0 };
    const kept = inbox.events.length >= MAX_INBOX_EVENTS ? inbox.events.slice(1) : inbox.events;
    const dropped = inbox.events.length - kept.length;
    this.inboxes.set(recipient, { events: [...kept, event], droppedCount: inbox.droppedCount + dropped });
  }

  drain(recipient: string): InboxBatch {
    const inbox = this.inboxes.get(recipient);
    this.inboxes.delete(recipient);
    return { events: inbox?.events ?? [], droppedCount: inbox?.droppedCount ?? 0 };
  }

  peek(recipient: string): readonly CoordinationEvent[] {
    return this.inboxes.get(recipient)?.events ?? [];
  }
}
