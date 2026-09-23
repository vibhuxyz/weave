import type { SessionConfigOption } from "@weave/protocol";
import { errorMessage } from "../shared/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SetConfigOptions {
  readonly sessionMgr: DesktopSessionManager;
  readonly compaction: CompactionController;
  readonly configId: string;
  readonly value: string;
  readonly send: (msg: ServerMessage) => void;
}

const MODEL_CATEGORY = "model";

function isModelOption(options: readonly SessionConfigOption[], configId: string): boolean {
  const option = options.find((candidate) => candidate.id === configId);
  return option?.category === MODEL_CATEGORY || configId === MODEL_CATEGORY;
}

export function handleSetConfig({ sessionMgr, compaction, configId, value, send }: SetConfigOptions): void {
  if (!sessionMgr.supervisor) return;
  if (compaction.isCompacting()) {
    send({ type: "config-rejected", configId, message: `Cannot change "${configId}" while the conversation is compacting.` });
    return;
  }
  const session = sessionMgr.supervisor.current;
  session
    .setConfigOption(configId, value)
    .then(() => {
      if (isModelOption(session.configOptions, configId)) compaction.invalidateContext(session.sessionId);
      send({ type: "config-changed", configId, value });
    })
    .catch((error: unknown) => {
      send({
        type: "config-rejected",
        configId,
        message: `"${configId}" was rejected: ${errorMessage(error)}`,
      });
    });
}
