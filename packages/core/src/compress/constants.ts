export const DEFAULT_MAX_CHARS = 4_000;
export const HEAD_LINES = 15;
export const TAIL_LINES = 40;
export const MAX_SIGNAL_LINES = 60;
export const MAX_LINE_CHARS = 400;

export const ANSI_ESCAPE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export const SIGNAL_LINE =
  /\b(error|errors|failed|failure|fail|exception|panic|assert(ion)?|expected|received|actual|cannot|undefined is not|TS\d{4})\b|✖|✗|×|FAIL\b/i;
