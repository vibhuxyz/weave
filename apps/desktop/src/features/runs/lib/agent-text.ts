import { withReadableHandoff } from "./handoff-text";
import { withReadableProtocol } from "./protocol-text";

export function readableAgentText(text: string): string {
  return withReadableHandoff(withReadableProtocol(text));
}
