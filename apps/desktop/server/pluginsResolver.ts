import { ENGINES } from "@weave/agent";
import {
  planActivation,
  formatActivationPlansSystemPrompt,
  type NormalizedPlugin,
  type ActivePluginRef,
  type ActivationPlan,
  type Ledger,
} from "@weave/core";

export function resolveSessionPlugins(options: {
  readonly refs?: readonly ActivePluginRef[];
  readonly currentEngineId: string;
  readonly pluginsById: ReadonlyMap<string, NormalizedPlugin>;
  readonly ledger: Ledger;
  readonly taskId: string;
}): string | undefined {
  const { refs, currentEngineId, pluginsById, ledger, taskId } = options;
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
    ledger.append("plugin.activated", {
      taskId,
      pluginId: plan.pluginId,
      version: plan.version,
      contentHash: plan.contentHash,
      engineId: plan.engineId,
      model: plan.model,
      mode: plan.mode,
      activatedCapabilities: plan.activatedCapabilities,
      unsupportedCapabilities: plan.unsupportedCapabilities.map(
        (c) => `${c.kind}:${c.name}`,
      ),
    });
  }

  return formatActivationPlansSystemPrompt(plans);
}
