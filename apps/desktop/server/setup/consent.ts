import {
  beginConsentDrive,
  nextConsentAction,
  terminalKeySequence,
  type ConsentDrive,
  type ParsedConsent,
  type PtyTerminalAuth,
} from "@weave/agent";
import { createLogger, type Logger } from "../logging/index.ts";
import type { ServerMessage, SetupConsent } from "../shared/index.ts";

/**
 * How long a keypress gets to change the screen before the drive is judged
 * stuck. The wizard only emits output when it repaints, so a key that does
 * nothing produces silence rather than a visible failure.
 */
const KEY_RESPONSE_TIMEOUT_MS = 6_000;

/**
 * How long the confirmed choice gets to become a finished wizard. Repaints do
 * not clear this one: the wizard repaints as it moves on, and only the setup
 * ending is proof the answer was recorded.
 */
const CONFIRM_TIMEOUT_MS = 30_000;

/**
 * The consent page of an engine's setup wizard.
 *
 * Shows the user the agreement as a native card, then drives the wizard to
 * match their answer — re-reading the screen before every key, and handing the
 * raw terminal back the moment anything does not look as expected.
 */
export class ConsentSession {
  private pty: PtyTerminalAuth | null = null;
  private drive: ConsentDrive | null = null;
  private published: string | null = null;
  /** The last screen seen, so a decision can act without waiting for a repaint. */
  private seen: { readonly lines: readonly string[]; readonly parsed: ParsedConsent } | null = null;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly engineId: string;
  private readonly send: (msg: ServerMessage) => void;
  private readonly log: Logger;

  // Written out rather than declared as constructor parameter properties:
  // `node --experimental-strip-types` runs the dev server and cannot erase
  // those, because they generate real assignments.
  constructor(engineId: string, send: (msg: ServerMessage) => void) {
    this.engineId = engineId;
    this.send = send;
    this.log = createLogger("setup.consent", { engineId });
  }

  attach(pty: PtyTerminalAuth | null): void {
    this.pty = pty;
    if (pty) return;
    this.clearStuckTimer();
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    this.log.debug("detached from the wizard", {
      keysSent: this.drive?.keysSent ?? 0,
      confirmed: this.drive?.confirmed ?? false,
      handedOver: this.drive?.handedOver ?? false,
    });
  }

  private clearStuckTimer(): void {
    if (this.stuckTimer) clearTimeout(this.stuckTimer);
    this.stuckTimer = null;
  }

  private armStuckTimer(): void {
    this.clearStuckTimer();
    this.stuckTimer = setTimeout(() => {
      this.stuckTimer = null;
      if (this.drive === null || this.drive.confirmed || this.drive.handedOver) return;
      this.drive = { ...this.drive, handedOver: true };
      this.handOver("the wizard stopped responding to keys");
    }, KEY_RESPONSE_TIMEOUT_MS);
    this.stuckTimer.unref?.();
  }

  private armConfirmTimer(): void {
    this.confirmTimer = setTimeout(() => {
      this.confirmTimer = null;
      this.handOver("the wizard did not finish after the choice was confirmed");
    }, CONFIRM_TIMEOUT_MS);
    this.confirmTimer.unref?.();
  }

  private handOver(reason: string): void {
    this.log.warn("handing the page back to the user", { reason });
    this.publish({ kind: "manual", reason });
  }

  get isDriving(): boolean {
    return this.drive !== null && !this.drive.handedOver && !this.drive.confirmed;
  }

  /**
   * Record the user's answer. Write-once: a goal that changed mid-drive would
   * let a screen read under one answer be acted on under the other.
   */
  submit(agreed: unknown): boolean {
    if (typeof agreed !== "boolean") {
      this.log.warn("consent refused: not an answer", { agreed: String(agreed) });
      return false;
    }
    if (this.drive !== null) {
      this.log.warn("consent refused: already answered", {
        agreed,
        keysSent: this.drive.keysSent,
      });
      return false;
    }

    this.log.info("consent answered by the user", { agreed, hasScreen: this.seen !== null });
    this.drive = beginConsentDrive(agreed);
    // The wizard is idle waiting for a key, so no repaint is coming to trigger
    // the first step. Act on the screen already in front of us.
    if (this.seen) this.advance(this.seen.lines, this.seen.parsed);
    else this.armStuckTimer();
    return true;
  }

  private publish(consent: SetupConsent): void {
    const key = JSON.stringify(consent);
    if (key === this.published) return;
    this.published = key;
    this.log.debug("panel state", { consent: consent.kind });
    this.send({ type: "setup-consent", engineId: this.engineId, consent });
  }

  /** Called for every repaint while the wizard is on its consent page. */
  observe(lines: readonly string[], parsed: ParsedConsent): void {
    this.seen = { lines, parsed };
    this.clearStuckTimer();
    if (parsed.kind === "parsed") {
      const { checked, focus, enterAction } = parsed.page;
      this.log.debug("consent page read", { checked, focus, enterAction, driving: this.isDriving });
    } else {
      this.log.debug("consent page unreadable", { reason: parsed.reason });
    }

    if (this.drive === null) {
      if (parsed.kind === "unparseable") {
        this.handOver(parsed.reason);
        return;
      }
      const { title, notice, agreement, checked, links } = parsed.page;
      this.publish({ kind: "card", title, notice, agreement, checked, links });
      return;
    }

    this.advance(lines, parsed);
  }

  private advance(lines: readonly string[], parsed: ParsedConsent): void {
    if (this.drive === null) return;
    const { action, drive } = nextConsentAction(this.drive, parsed, lines.join("\n"));
    this.drive = drive;

    if (action.kind === "handover") {
      this.clearStuckTimer();
      this.handOver(action.reason);
      return;
    }
    if (action.kind === "wait") return;

    this.log.info("driving the wizard", {
      key: action.key,
      intent: action.intent,
      keysSent: drive.keysSent,
      toggles: drive.toggles,
    });
    const pty = this.pty;
    if (!pty) {
      this.clearStuckTimer();
      this.handOver("the wizard is no longer running");
      return;
    }

    this.publish({ kind: "applying" });
    pty.submitKeys(terminalKeySequence(action.key));
    if (drive.confirmed) this.armConfirmTimer();
    else this.armStuckTimer();
  }
}
