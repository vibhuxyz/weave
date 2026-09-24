import { randomUUID } from "node:crypto";
import type { CreateElicitationResponse } from "@weave/protocol";
import type { QuestionField } from "../shared/index.ts";

export interface PendingQuestion {
  readonly requestId: string;
  readonly message: string;
  readonly fields: readonly QuestionField[];
  readonly settle: (response: CreateElicitationResponse) => void;
}

export class PendingQuestions {
  private readonly waiting = new Map<string, PendingQuestion>();

  open(
    question: { readonly message: string; readonly fields: readonly QuestionField[] },
    settle: (response: CreateElicitationResponse) => void,
  ): PendingQuestion {
    const entry: PendingQuestion = { requestId: randomUUID(), ...question, settle };
    this.waiting.set(entry.requestId, entry);
    return entry;
  }

  get(requestId: string): PendingQuestion | undefined {
    return this.waiting.get(requestId);
  }

  settle(requestId: string, response: CreateElicitationResponse): boolean {
    const entry = this.waiting.get(requestId);
    if (!entry) return false;
    this.waiting.delete(requestId);
    entry.settle(response);
    return true;
  }

  cancelAll(): void {
    for (const requestId of [...this.waiting.keys()]) {
      this.settle(requestId, { action: "cancel" });
    }
  }
}
