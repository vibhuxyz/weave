import type { PtyTerminalAuth } from "@weave/agent";
import type { ServerMessage } from "../shared/index.ts";
import type { ConsentSession } from "./consent.ts";

export interface RunSetupOptions {
  readonly engineId: string;
  readonly consent: ConsentSession;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly send: (msg: ServerMessage) => void;
  readonly onSessionReady: (session: PtyTerminalAuth | null) => void;
}

export interface SetupOutcome {
  readonly ok: boolean;
  readonly error: string | null;
}
