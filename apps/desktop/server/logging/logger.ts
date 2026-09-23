import { DEFAULT_LOG_LEVEL, LEVEL_ORDER } from "./constants.ts";
import { formatRecord } from "./format.ts";
import { consoleSink } from "./sink.ts";
import type { LogFields, Logger, LogLevel, LogSink } from "./types.ts";

const state: { sinks: LogSink[]; level: LogLevel } = {
  sinks: [consoleSink],
  level: DEFAULT_LOG_LEVEL,
};

export function parseLogLevel(value: string | undefined): LogLevel | null {
  if (value === undefined) return null;
  const wanted = value.trim().toLowerCase();
  return wanted in LEVEL_ORDER ? (wanted as LogLevel) : null;
}

export function setLogLevel(level: LogLevel): void {
  state.level = level;
}

export function addLogSink(sink: LogSink): void {
  state.sinks.push(sink);
}

function emit(component: string, level: LogLevel, message: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[state.level]) return;
  const line = formatRecord({
    time: new Date().toISOString(),
    level,
    component,
    message,
    fields,
  });
  for (const sink of state.sinks) sink.write(line, level);
}

export function createLogger(component: string, base: LogFields = {}): Logger {
  const at = (level: LogLevel) => (message: string, fields: LogFields = {}) =>
    emit(component, level, message, { ...base, ...fields });

  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (fields: LogFields) => createLogger(component, { ...base, ...fields }),
  };
}
