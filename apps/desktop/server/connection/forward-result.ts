import { errorMessage } from "../shared/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export function forwardResult<T>(
  promise: Promise<T>,
  send: (msg: ServerMessage) => void,
  onSuccess: (value: T) => ServerMessage,
  errorPrefix: string,
): void {
  promise.then(
    (value) => send(onSuccess(value)),
    (error: unknown) => send({ type: "error", message: `${errorPrefix}: ${errorMessage(error)}` }),
  );
}
