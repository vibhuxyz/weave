import { EVENT_FENCE_LANGUAGE } from "./constants.ts";

export function renderEmployeeProtocol(): string {
  const fence = "```";
  return [
    "You work alongside other employees. Weave routes structured events between you; there is no free-form chat.",
    "Publish an output as soon as it is usable, before your whole task is done, so dependent employees can start.",
    "To publish, write a fenced block in your message (one event per block):",
    `${fence}${EVENT_FENCE_LANGUAGE}`,
    '{ "type": "artifact.ready", "data": { "artifact": { "name": "schema", "summary": "what it is", "provides": ["Todo", "CreateTodoInput"], "files": [{ "path": "db/schema.sql", "content": "..." }] } } }',
    fence,
    '"provides" lists the exact output names dependent employees wait for. A dependent does not start until every name it needs is published, and it does not wait for the rest of your task.',
    "Types: artifact.ready, artifact.updated, contract.published, contract.changed (same artifact data);",
    'dependency.blocked { "need": { "output": "name", "task": "optional id" }, "reason": "..." };',
    'subtask.completed { "subtask": "the milestone, worded as Weave listed it" };',
    'split.suggested { "areas": ["repo/relative/dir"], "reason" }: publish once, only if the request turns out to span independent areas that other workers could do in parallel, then keep working in your own area.',
    'task.blocked { "reason" }; review.requested, verification.failed, verification.passed { "summary" }; escalation.created { "subject", "reason" }.',
    "Report a milestone the moment it is done, not at the end. Report milestones, outputs and blockers only: never a single file edit, command or tool call.",
    "When you are blocked on one input, publish dependency.blocked and keep doing the work that does not need it.",
  ].join("\n");
}
