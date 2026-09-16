import type { RunConfig } from "./types.ts";

export function agentConfigFrom(config: RunConfig): Record<string, string> {
  const out: Record<string, string> = {};
  if (config.model) out.model = config.model;
  if (config.mode) out.mode = config.mode;
  if (config.effort) out.effort = config.effort;
  if (config.fast) out.fast = config.fast;
  return out;
}

export function configId(config: RunConfig): string {
  if (config.id) return config.id;
  const parts = [
    config.engine,
    config.model,
    config.effort,
    config.fast ? `fast-${config.fast}` : undefined,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  return parts.length > 0 ? parts.join("-") : "default";
}
