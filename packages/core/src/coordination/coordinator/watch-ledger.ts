import type { WeaveEvent } from "@weave/protocol";
import { isRecord, parseJsonBlock, type Ledger } from "../../shared/index.ts";
import { EventBlockExtractor, parseEmployeeEvent, type EmployeeSubmission } from "../employee/index.ts";
import type { PublishResult } from "./types.ts";

type Submit = (taskId: string, submission: EmployeeSubmission) => PublishResult;

function agentText(event: WeaveEvent): { readonly taskId: string; readonly text: string } | null {
  if (event.type !== "agent.message" || !event.taskId || !isRecord(event.update)) return null;
  const { sessionUpdate, content } = event.update;
  if (sessionUpdate !== "agent_message_chunk" || !isRecord(content) || content["type"] !== "text") return null;
  return typeof content["text"] === "string" ? { taskId: event.taskId, text: content["text"] } : null;
}

function submitBlock(ledger: Ledger, taskId: string, block: string, submit: Submit): void {
  const parsed = parseJsonBlock(block);
  const checked = parsed.ok ? parseEmployeeEvent(parsed.value) : { ok: false as const, issues: [parsed.issue] };
  if (!checked.ok) {
    ledger.append("coordination.rejected", { taskId, reason: checked.issues.join("; ") });
    return;
  }
  const published = submit(taskId, checked.submission);
  if (!published.ok) ledger.append("coordination.rejected", { taskId, reason: published.reason });
}

export function watchEmployeeMessages(ledger: Ledger, submit: Submit): () => void {
  const extractor = new EventBlockExtractor();
  return ledger.subscribe((event) => {
    const message = agentText(event);
    if (!message) return;
    const extracted = extractor.push(message.taskId, message.text);
    for (const block of extracted.blocks) submitBlock(ledger, message.taskId, block, submit);
    if (extracted.overflowedChars > 0) {
      ledger.append("coordination.rejected", { taskId: message.taskId, reason: `An unterminated event block grew past ${extracted.overflowedChars} characters and was dropped` });
    }
  });
}
