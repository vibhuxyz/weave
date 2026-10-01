import assert from "node:assert/strict";
import test from "node:test";
import { isEngineStderrNoise, traceExportEnv } from "./engine-telemetry.ts";

const EXPORT_ERROR =
  '2026-10-01T16:51:09.864124Z ERROR name="BatchSpanProcessor.ExportError" error="Operation failed: HTTP export failed: network error"';

test("a failed trace export is noise and a real engine error is kept", () => {
  assert.equal(isEngineStderrNoise(EXPORT_ERROR), true);
  assert.equal(isEngineStderrNoise("[agy-acp] WARN: failed to decode gen_metadata x"), true);
  assert.equal(
    isEngineStderrNoise("Error: listen EADDRINUSE: address already in use 127.0.0.1:8137"),
    false,
  );
});

test("an inherited trace endpoint does not export unless the user opted in", () => {
  const inherited = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9" };
  assert.deepEqual(traceExportEnv(inherited), { OTEL_TRACES_EXPORTER: "none" });
  assert.deepEqual(traceExportEnv({}), { OTEL_TRACES_EXPORTER: "none" });
  assert.deepEqual(traceExportEnv({ ...inherited, OTEL_TRACES_EXPORTER: "otlp" }), {});
  assert.deepEqual(traceExportEnv({ ...inherited, GROK_EXTERNAL_OTEL: "1" }), {});
  assert.deepEqual(traceExportEnv({ OTEL_TRACES_EXPORTER: "none" }), {});
});
