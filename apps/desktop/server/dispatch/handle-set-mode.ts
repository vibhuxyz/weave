import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SetModeOptions {
  readonly modeId: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly send: (msg: ServerMessage) => void;
}

/**
 * Switch the agent's operating mode (plan, accept-edits, …).
 *
 * The agent owns what each mode means; this only asks it to change and reports
 * back whatever it says its modes are afterwards.
 */
export async function handleSetMode({
  modeId,
  sessionMgr,
  send,
}: SetModeOptions): Promise<void> {
  const session = sessionMgr.supervisor?.current;
  if (!session) return;

  try {
    await session.setMode(modeId);
    send({ type: "modes", modes: session.modes });
  } catch (err: unknown) {
    send({
      type: "error",
      message: `Could not switch mode: ${err instanceof Error ? err.message : String(err)}`,
    });
    send({ type: "modes", modes: session.modes });
  }
}
