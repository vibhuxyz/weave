import { EVENT_FENCE_LANGUAGE } from "./constants.ts";

export function renderEmployeeProtocol(): string {
  const fence = "```";
  return [
    "You work alongside other employees. Weave routes structured events between you; there is no free-form chat.",
    "Publish an output as soon as it is usable, before your whole task is done, so dependent employees can start.",
    "To publish, write a fenced block in your message (one event per block):",
    `${fence}${EVENT_FENCE_LANGUAGE}`,
    '{ "type": "artifact.ready", "data": { "artifact": { "name": "schema", "summary": "what it is", "files": [{ "path": "db/schema.sql", "content": "..." }] } } }',
    fence,
    "Types: artifact.ready, artifact.updated, contract.published, contract.changed (same artifact data);",
    'dependency.blocked { "need": { "output": "name", "task": "optional id" }, "reason": "..." };',
    'task.blocked { "reason" }; review.requested, verification.failed, verification.passed { "summary" }; escalation.created { "subject", "reason" }.',
    "When you are blocked on one input, publish dependency.blocked and keep doing the work that does not need it.",
  ].join("\n");
}
