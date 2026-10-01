const TRACE_EXPORTER_ENV = "OTEL_TRACES_EXPORTER";
const TRACE_EXPORTER_OFF = "none";
const EXTERNAL_OTEL_ENV = "GROK_EXTERNAL_OTEL";
const EXTERNAL_OTEL_ON = new Set(["1", "true", "yes"]);

const STDERR_NOISE = [
  /^\[agy-acp\] WARN: failed to decode gen_metadata /,
  /name="BatchSpanProcessor\.ExportError"/,
] as const;

export function isEngineStderrNoise(line: string): boolean {
  return STDERR_NOISE.some((pattern) => pattern.test(line));
}

export function traceExportEnv(
  parent: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  if (keepsConfiguredTraceExport(parent)) return {};
  return { [TRACE_EXPORTER_ENV]: TRACE_EXPORTER_OFF };
}

function keepsConfiguredTraceExport(
  parent: Readonly<Record<string, string | undefined>>,
): boolean {
  const chosen = parent[TRACE_EXPORTER_ENV]?.trim();
  if (chosen) return true;
  const external = parent[EXTERNAL_OTEL_ENV]?.trim().toLowerCase();
  return external !== undefined && EXTERNAL_OTEL_ON.has(external);
}
