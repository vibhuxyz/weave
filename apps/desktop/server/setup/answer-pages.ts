import { classifySetupPage, type TerminalKeyName } from "@weave/agent";
import type { Logger } from "../logging/index.ts";
import type { ConsentSession } from "./consent.ts";

/**
 * Pages Weave will answer before handing the wizard over. A wizard that keeps
 * producing answerable pages past this is not one we understand; showing it is
 * better than holding Enter forever.
 */
const MAX_AUTO_PAGES = 8;

/** Enough of a page to tell two screens apart in the log without dumping both. */
const LOGGED_SCREEN_CHARS = 160;

export interface PageAnswererOptions {
  readonly consent: ConsentSession;
  readonly log: Logger;
  readonly sendKey: (key: TerminalKeyName) => void;
}

/**
 * Answer the pages that are not the user's to answer — the colour scheme the
 * user will never see. A consent page stops this and is streamed to the UI
 * instead. Each distinct screen is answered once, so a page that does not
 * advance is shown rather than hammered.
 */
export function createPageAnswerer({
  consent,
  log,
  sendKey,
}: PageAnswererOptions): (lines: readonly string[]) => void {
  const state = { autoAnswered: 0, lastAutoScreen: "", lastLoggedScreen: "" };

  return (lines: readonly string[]): void => {
    const page = classifySetupPage(lines);
    const screen = lines.join("\n");

    if (screen !== state.lastLoggedScreen) {
      state.lastLoggedScreen = screen;
      log.debug("wizard page", {
        page: page.kind,
        parsed: page.kind === "consent" ? page.parsed.kind : undefined,
        lines: lines.length,
        head: screen.slice(0, LOGGED_SCREEN_CHARS),
      });
    }

    if (page.kind === "consent") {
      consent.observe(lines, page.parsed);
      return;
    }
    if (page.kind !== "auto") return;
    if (state.autoAnswered >= MAX_AUTO_PAGES) {
      log.warn("too many answerable pages, leaving the wizard to the user", {
        autoAnswered: state.autoAnswered,
      });
      return;
    }
    if (screen === state.lastAutoScreen) return;

    state.lastAutoScreen = screen;
    state.autoAnswered += 1;
    log.info("answering a cosmetic page", {
      reason: page.reason,
      key: page.key,
      autoAnswered: state.autoAnswered,
    });
    sendKey(page.key);
  };
}
