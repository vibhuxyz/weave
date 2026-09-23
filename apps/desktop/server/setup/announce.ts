import { engineSetupState, getEngine } from "@weave/agent";
import type { ServerMessage } from "../shared/index.ts";

/**
 * Tell the renderer an engine still has a first-run wizard outstanding, so it
 * can offer to run it instead of letting the user watch a command hang.
 */
export function announceSetupRequired(
  engineId: string,
  send: (msg: ServerMessage) => void,
): void {
  const engine = getEngine(engineId);
  const { required, setup } = engineSetupState(engine);
  if (!required || !setup) return;
  send({
    type: "setup-required",
    engineId: engine.id,
    engineLabel: engine.label,
    description: setup.description,
  });
}
