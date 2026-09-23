import type { PermissionPrompter } from "@weave/agent";
import type { PermissionOption, ServerMessage } from "../shared/index.ts";
import type { PendingPermissions } from "./pending.ts";

export interface CreateUserPrompterOptions {
  readonly pending: PendingPermissions;
  readonly send: (msg: ServerMessage) => void;
}

function toOptions(
  options: readonly { optionId: string; name: string; kind: string }[],
): readonly PermissionOption[] {
  return options.map((option) => ({
    optionId: option.optionId,
    name: option.name,
    kind: option.kind,
  }));
}

/**
 * Ask the user, and hold the ACP request open until they answer.
 *
 * The agent's own options are passed through untouched — it decides what
 * choices exist, we only render them and report back which one was picked.
 */
export function createUserPrompter({
  pending,
  send,
}: CreateUserPrompterOptions): PermissionPrompter {
  return (_task, request, command) =>
    new Promise((resolve) => {
      const options = toOptions(request.options ?? []);
      const entry = pending.open(options, (optionId) => {
        if (optionId === null) {
          send({ type: "permission-cancelled", requestId: entry.requestId });
          resolve({ decision: "reject", reason: "declined by user" });
          return;
        }
        resolve({ decision: "allow", optionId, reason: "approved by user" });
      });

      send({
        type: "permission-request",
        requestId: entry.requestId,
        toolCallId: request.toolCall.toolCallId ?? null,
        title: request.toolCall.title ?? "Tool call",
        kind: request.toolCall.kind ?? "other",
        command,
        options,
      });
    });
}
