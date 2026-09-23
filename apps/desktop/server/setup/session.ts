import { isTerminalKeyName, terminalKeySequence, type PtyTerminalAuth } from "@weave/agent";
import { createLogger } from "../logging/index.ts";
import type { ConsentSession } from "./consent.ts";

const log = createLogger("setup.session");

/** The setup wizard currently on screen, if any. */
export class ActiveSetup {
  private abort: AbortController | null = null;
  private pty: PtyTerminalAuth | null = null;
  private consent: ConsentSession | null = null;
  private engineId: string | null = null;

  get isRunning(): boolean {
    return this.abort !== null;
  }

  start(engineId: string): AbortController {
    this.cancel();
    log.info("setup requested", { engineId });
    this.engineId = engineId;
    this.abort = new AbortController();
    return this.abort;
  }

  attach(pty: PtyTerminalAuth | null): void {
    this.pty = pty;
  }

  attachConsent(consent: ConsentSession | null): void {
    this.consent = consent;
  }

  submitConsent(agreed: unknown): boolean {
    if (!this.consent) {
      log.warn("consent arrived with no wizard running", { agreed: String(agreed) });
      return false;
    }
    return this.consent.submit(agreed);
  }

  /**
   * Forward one allowlisted key to the wizard. Anything else is dropped.
   *
   * Refused while the consent driver is working: two writers into one PTY
   * would break the driver's reading of what its own keypress changed, and
   * could move focus under it just before a confirm.
   */
  sendKey(key: unknown): boolean {
    if (!this.pty || !isTerminalKeyName(key)) {
      log.debug("key dropped", { key: String(key), hasWizard: this.pty !== null });
      return false;
    }
    if (this.consent?.isDriving) {
      log.debug("key held back while the consent driver works", { key });
      return false;
    }
    this.pty.submitKeys(terminalKeySequence(key));
    return true;
  }

  cancel(): void {
    if (this.abort) log.info("setup cancelled", { engineId: this.engineId });
    this.abort?.abort();
    this.abort = null;
    this.pty = null;
    this.consent = null;
    this.engineId = null;
  }

  finish(): void {
    this.abort = null;
    this.pty = null;
    this.consent = null;
    this.engineId = null;
  }

  get activeEngineId(): string | null {
    return this.engineId;
  }
}
