export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly time: string;
  readonly level: LogLevel;
  readonly component: string;
  readonly message: string;
  readonly fields: LogFields;
}

export interface LogSink {
  write(line: string, level: LogLevel): void;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}
