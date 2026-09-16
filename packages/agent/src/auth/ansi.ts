const ANSI_PATTERN_1 = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ANSI_PATTERN_2 = /\x1B\([a-zA-Z]/g;
const ANSI_PATTERN_3 = /\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g;

export function stripAnsi(text: string): string {
  return text
    .replace(ANSI_PATTERN_1, "")
    .replace(ANSI_PATTERN_2, "")
    .replace(ANSI_PATTERN_3, "");
}
