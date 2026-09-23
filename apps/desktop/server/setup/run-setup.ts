import {
  augmentPathWithUserDirs,
  engineSetupState,
  getEngine,
  startPtyCommand,
  terminalKeySequence,
  type EngineSetup,
  type PtyTerminalAuth,
} from "@weave/agent";
import { AUTH_OUTPUT_MAX_LINES } from "@weave/protocol";
import { createLogger } from "../logging/index.ts";
import { createPageAnswerer } from "./answer-pages.ts";
import { setupMarkerPath } from "./completion.ts";
import { settleSetup } from "./settle.ts";
import type { RunSetupOptions, SetupOutcome } from "./types.ts";

function spawnWizard(options: {
  readonly setup: EngineSetup;
  readonly projectDir: string;
  readonly abort: AbortController;
  readonly onOutput: (lines: readonly string[]) => void;
}): PtyTerminalAuth {
  return startPtyCommand({
    command: {
      command: options.setup.command,
      args: [...(options.setup.args ?? [])],
      env: { PATH: augmentPathWithUserDirs(process.env.PATH) },
    },
    cwd: options.projectDir,
    promptAnswers: [],
    signal: options.abort.signal,
    outputMode: "screen",
    onOutput: options.onOutput,
  });
}

/**
 * Run an engine's first-run wizard in a PTY and stream it to the renderer.
 *
 * The wizard is shown, never answered for the user: it carries consent choices
 * that are theirs to make. We only carry the screen out and the keys back.
 */
export async function runEngineSetup({
  engineId,
  consent,
  projectDir,
  abort,
  send,
  onSessionReady,
}: RunSetupOptions): Promise<SetupOutcome> {
  const engine = getEngine(engineId);
  const { setup } = engineSetupState(engine);
  const log = createLogger("setup.run", { engineId });
  if (!setup) {
    log.info("engine has no wizard");
    return { ok: true, error: null };
  }

  const held: { session: PtyTerminalAuth | null } = { session: null };
  const answerPages = createPageAnswerer({
    consent,
    log,
    sendKey: (key) => held.session?.submitKeys(terminalKeySequence(key)),
  });

  log.info("wizard starting", {
    command: setup.command,
    args: setup.args ?? [],
    cwd: projectDir,
    marker: setupMarkerPath(engine),
  });

  const session = spawnWizard({
    setup,
    projectDir,
    abort,
    onOutput: (lines) => {
      answerPages(lines);
      send({ type: "setup-output", engineId: engine.id, lines: lines.slice(-AUTH_OUTPUT_MAX_LINES) });
    },
  });

  held.session = session;
  consent.attach(session);
  onSessionReady(session);
  try {
    return await settleSetup({ engine, session, abort, log });
  } finally {
    consent.attach(null);
    onSessionReady(null);
  }
}
