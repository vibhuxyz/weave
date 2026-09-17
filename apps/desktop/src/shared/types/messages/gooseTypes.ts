// Seam cut: Berd imports these two from the vendored `@aaif/goose-sdk`.
// This app has no Goose, so they are declared locally with the same shape.
// Both are MCP types Goose merely re-exported: tool `_meta`, and the result
// of an MCP resources/read. Tighten them if you ever add MCP support.

/** Arbitrary `_meta` a tool may carry. */
export type GooseToolMetadata = Record<string, unknown> & {
  ui?: unknown;
  goose_extension?: string;
};

/** MCP `resources/read` result. */
export type GooseReadResourceResult = {
  contents: Array<Record<string, unknown>>;
  _meta?: Record<string, unknown>;
};
