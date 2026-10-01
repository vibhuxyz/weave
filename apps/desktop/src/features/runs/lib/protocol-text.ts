import { EVENT_BLOCK_IN_TEXT, MAX_EVENT_SUMMARY_CHARS, NOTES_BLOCK_IN_TEXT, SAVED_NOTES_TEXT, SENDING_UPDATE_TEXT } from "../constants";

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parsedEvent(body: string | undefined): Fields | null {
  if (body === undefined) return null;
  try {
    return fieldsOf(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function eventSummary(event: Fields): string {
  const data = fieldsOf(event.data);
  switch (event.type) {
    case "subtask.completed":
      return `Milestone done: ${textOf(data?.subtask)}`;
    case "artifact.ready":
    case "artifact.updated":
    case "contract.published":
    case "contract.changed":
      return `Published ${textOf(fieldsOf(data?.artifact)?.name) || "an output"}`;
    case "dependency.blocked":
      return `Waiting for ${textOf(fieldsOf(data?.need)?.output) || "another worker"}`;
    case "task.blocked":
      return `Blocked: ${textOf(data?.reason)}`;
    case "verification.passed":
      return `Checks passed: ${textOf(data?.summary)}`;
    case "verification.failed":
      return `Checks failed: ${textOf(data?.summary)}`;
    case "escalation.created":
      return `Raised with Weave: ${textOf(data?.subject)}`;
    default:
      return "Sent an update to Weave";
  }
}

function clipped(text: string): string {
  const characters = [...text];
  return characters.length <= MAX_EVENT_SUMMARY_CHARS ? text : `${characters.slice(0, MAX_EVENT_SUMMARY_CHARS - 1).join("")}…`;
}

export function withReadableProtocol(text: string): string {
  return text
    .replace(EVENT_BLOCK_IN_TEXT, (_block: string, body: string | undefined) => {
      const event = parsedEvent(body);
      return event === null ? SENDING_UPDATE_TEXT : `**Update for Weave:** ${clipped(eventSummary(event))}`;
    })
    .replace(NOTES_BLOCK_IN_TEXT, SAVED_NOTES_TEXT);
}
