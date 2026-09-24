import { ENGINES } from "@weave/agent/browser";

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
 * Which built-in employees suit which work. Ids are the employee agent ids
 * from `useAgents` (`employee:<id>`), so a recommendation is a real employee.
 */
export interface RecommendedAgent {
  id: string;
  workTypeIds: readonly WorkTypeId[];
}

export const RECOMMENDED_AGENTS: readonly RecommendedAgent[] = [
  { id: "employee:backend-engineer", workTypeIds: ["engineering", "product", "not-sure"] },
  { id: "employee:frontend-engineer", workTypeIds: ["engineering", "design", "product", "not-sure"] },
  { id: "employee:qa-engineer", workTypeIds: ["engineering", "product"] },
  { id: "employee:security-engineer", workTypeIds: ["engineering", "legal"] },
  { id: "employee:database-engineer", workTypeIds: ["engineering"] },
  { id: "employee:devops-engineer", workTypeIds: ["engineering"] },
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
