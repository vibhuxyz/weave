import { ENGINES } from "@weave/agent/engines-registry.ts";

export const WORK_TYPE_IDS = [
  "engineering",
  "legal",
  "marketing",
  "product",
  "design",
  "writing",
  "not-sure",
] as const;

export type WorkTypeId = (typeof WORK_TYPE_IDS)[number];

const WORK_TYPE_ID_SET = new Set<string>(WORK_TYPE_IDS);

export function isWorkTypeId(value: string): value is WorkTypeId {
  return WORK_TYPE_ID_SET.has(value);
}

/** Presentation copy is keyed by these stable ids in the onboarding locale. */
export const WORK_TYPES: readonly { id: WorkTypeId }[] = WORK_TYPE_IDS.map(
  (id) => ({ id }),
);

/**
 * Which built-in agents suit which work. Upstream Berd ships its own four
 * invented personas here; this app already has six built-ins in `useAgents`,
 * with names and descriptions written for it, so the recommendations point at
 * those instead of inventing a parallel set that would then need adopting.
 *
 * Ids match `BUILTINS` in `src/useAgents.ts`.
 */
export interface RecommendedAgent {
  id: string;
  workTypeIds: readonly WorkTypeId[];
}

export const RECOMMENDED_AGENTS: readonly RecommendedAgent[] = [
  { id: "builtin:builder", workTypeIds: ["engineering", "product", "marketing", "not-sure"] },
  { id: "builtin:debugger", workTypeIds: ["engineering"] },
  { id: "builtin:reviewer", workTypeIds: ["engineering", "legal", "product", "not-sure"] },
  { id: "builtin:generalist", workTypeIds: ["legal", "marketing", "writing", "design", "not-sure"] },
  { id: "builtin:craftsman", workTypeIds: ["design", "writing"] },
  { id: "builtin:committer", workTypeIds: ["engineering"] },
];

const agentOrder = new Map(
  RECOMMENDED_AGENTS.map((agent, index) => [agent.id, index]),
);

/**
 * Top three agents for the chosen work, most-matched first. Ties break on
 * catalog order so the same selection always yields the same three, and an
 * empty selection still returns a sensible default trio.
 */
export function recommendationsForWorkTypes(
  workTypeIds: readonly string[],
): RecommendedAgent[] {
  const selected = new Set(workTypeIds);
  return RECOMMENDED_AGENTS.map((agent) => ({
    agent,
    score: agent.workTypeIds.reduce(
      (total, workTypeId) => total + (selected.has(workTypeId) ? 1 : 0),
      0,
    ),
  }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (agentOrder.get(left.agent.id) ?? 0) -
          (agentOrder.get(right.agent.id) ?? 0),
    )
    .slice(0, 3)
    .map(({ agent }) => agent);
}

/**
 * The engines offered during onboarding, in display order. Upstream picks from
 * a curated provider catalog; here the source of truth is the engine registry
 * the app actually installs and runs, so an engine can never be offered that
 * `install_engine` cannot handle.
 */
export const ONBOARDING_ENGINE_IDS = [
  "claude-code",
  "codex",
  "gemini",
  "amp",
  "antigravity",
] as const;

export type OnboardingEngineId = (typeof ONBOARDING_ENGINE_IDS)[number];

export interface OnboardingEngine {
  id: string;
  label: string;
  packageName: string;
  /** Falls back to the engine's provider when the id itself has no icon. */
  iconId: string;
}

export const ONBOARDING_ENGINES: readonly OnboardingEngine[] =
  ONBOARDING_ENGINE_IDS.flatMap((id) => {
    const engine = ENGINES[id];
    if (!engine) return [];
    return [
      {
        id: engine.id,
        label: engine.label,
        packageName: engine.packageName,
        iconId: engine.id,
      },
    ];
  });

export function engineProviderFallback(engineId: string): string {
  return ENGINES[engineId]?.provider ?? engineId;
}
