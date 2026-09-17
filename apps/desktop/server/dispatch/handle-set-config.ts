import { errorMessage } from "../shared/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SetConfigOptions {
  readonly sessionMgr: DesktopSessionManager;
  readonly configId: string;
  readonly value: string;
  readonly send: (msg: ServerMessage) => void;
}

export function handleSetConfig({ sessionMgr, configId, value, send }: SetConfigOptions): void {
  if (!sessionMgr.supervisor) return;
  sessionMgr.supervisor.current
    .setConfigOption(configId, value)
    .then(() => send({ type: "config-changed", configId, value }))
    .catch((error: unknown) => {
      send({
        type: "config-rejected",
        configId,
        message: `"${configId}" was rejected: ${errorMessage(error)}`,
      });
    });
}
