import { ENGINES } from "@weave/agent";
import {
  planActivation,
  formatActivationPlansSystemPrompt,
  type NormalizedPlugin,
  type ActivePluginRef,
  type ActivationPlan,
  type Ledger,
} from "@weave/core";

export interface ResolvePluginsOptions {
  readonly refs?: readonly ActivePluginRef[];
  readonly currentEngineId: string;
  readonly pluginsById: ReadonlyMap<string, NormalizedPlugin>;
  readonly ledger: Ledger;
  readonly taskId: string;
}

export function resolveSessionPlugins({
  refs,
  currentEngineId,
  pluginsById,
  ledger,
  taskId,
}: ResolvePluginsOptions): string | undefined {
  if (!refs || refs.length === 0) return undefined;

  const engine = ENGINES[currentEngineId];
  if (!engine) return undefined;

  const profile = {
    id: engine.id,
    pluginModel: engine.pluginModel,
    mcp: engine.capabilities.mcp,
  };

  const plans: ActivationPlan[] = [];
  for (const ref of refs) {
    const plugin = pluginsById.get(ref.id);
    if (!plugin) continue;
    const plan = planActivation(plugin, ref, profile);
    plans.push(plan);

    const unsupportedCapabilities = plan.unsupportedCapabilities.map(
      (c) => `${c.kind}:${c.name}`,
    );
    const sortedUnsupported = Array.from(unsupportedCapabilities).sort();

    ledger.append("plugin.activated", {
      taskId,
      pluginId: plan.pluginId,
      version: plan.version,
      contentHash: plan.contentHash,
      engineId: plan.engineId,
      model: plan.model,
      mode: plan.mode,
      activatedCapabilities: plan.activatedCapabilities,
      unsupportedCapabilities: sortedUnsupported,
    });
  }

  return formatActivationPlansSystemPrompt(plans);
}
