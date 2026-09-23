const SGR_SEQUENCE = /\x1B\[[0-9;:]*m/g;
const CSI_SEQUENCE = /\x1B\[[0-9;:?<>=$!"' ]*[@-~]/g;
const OSC_SEQUENCE = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;
const SHORT_ESCAPE = /\x1B[()][A-Za-z0-9]|\x1B[=>78DEHMc\\]/g;
const SPINNER_GLYPHS = /[⠀-⣿]/g;
const CONTROL_CHARACTERS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const WHITESPACE_RUN = /\s+/g;
const LINE_BREAK = /\r?\n|\r/;

export function toScreenLines(raw: string): string[] {
  const text = raw
    .replace(OSC_SEQUENCE, " ")
    .replace(SGR_SEQUENCE, "")
    .replace(CSI_SEQUENCE, " ")
    .replace(SHORT_ESCAPE, " ")
    .replace(SPINNER_GLYPHS, " ");

  return text
    .split(LINE_BREAK)
    .map((line) => line.replace(CONTROL_CHARACTERS, "").replace(WHITESPACE_RUN, " ").trim())
    .filter((line) => line.length > 0);
}

export function mergeScreenLines(
  previous: readonly string[],
  next: readonly string[],
  maxLines: number,
): string[] {
  const seen = new Set(previous);
  const merged = [...previous];
  for (const line of next) {
    if (seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
  }
  return merged.slice(-maxLines);
}

/** Sequences a full-screen TUI uses to repaint from scratch. */
const SCREEN_CLEAR = /\x1B\[[0-3]?J|\x1B\[2J|\x1Bc/;

/**
 * Keep only what the terminal has painted since it last cleared the screen.
 *
 * A wizard repaints in place, so its transcript is every page ever shown at
 * once. Cutting at the last clear leaves the page actually on screen.
 */
export function currentScreen(raw: string): string {
  let cut = 0;
  for (const match of raw.matchAll(new RegExp(SCREEN_CLEAR, "g"))) {
    if (match.index !== undefined) cut = match.index + match[0].length;
  }
  return raw.slice(cut);
}
