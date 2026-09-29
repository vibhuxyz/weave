import type { TaskContract } from "@weave/protocol";
import { CAPABILITIES, type Capability, type RuntimeChoice, type RuntimeProfile } from "./types.ts";

const CAPABILITY_BY_NAME: ReadonlyMap<string, Capability> = new Map(
  CAPABILITIES.map((capability) => [capability, capability]),
);

const PATH_HINTS: readonly (readonly [RegExp, Capability])[] = [
  [/(^|\/)(migrations?|schema|prisma|db)(\/|$)/i, "database"],
  [/(^|\/)(apps?\/web|web|ui|components?|pages?)(\/|$)/i, "frontend"],
  [/(^|\/)(apps?\/api|api|server|services?|backend)(\/|$)/i, "backend"],
  [/(^|\/)(tests?|__tests__|e2e|spec)(\/|$)/i, "testing"],
  [/(^|\/)(\.github|deploy|infra|terraform|k8s|helm)(\/|$)/i, "devops"],
];

const PROMPT_HINTS: readonly (readonly [RegExp, Capability])[] = [
  [/\b(investigate|diagnose|root cause|why|reproduce)\b/i, "repository-investigation"],
  [/\b(migration|schema|index|query|sql)\b/i, "database"],
  [/\b(component|page|screen|css|layout)\b/i, "frontend"],
  [/\b(endpoint|route|handler|api)\b/i, "backend"],
  [/\b(test|spec|coverage)\b/i, "testing"],
  [/\b(deploy|pipeline|docker|ci)\b/i, "devops"],
];

function hits(rules: readonly (readonly [RegExp, Capability])[], text: string): readonly Capability[] {
  return rules.flatMap(([pattern, capability]) => (pattern.test(text) ? [capability] : []));
}

export function requiredCapabilities(task: Pick<TaskContract, "capabilities" | "allowedPaths" | "prompt">): readonly Capability[] {
  const declared = (task.capabilities ?? []).flatMap((name) => {
    const known = CAPABILITY_BY_NAME.get(name.trim().toLowerCase());
    return known ? [known] : [];
  });
  if (declared.length > 0) return [...new Set(declared)].sort();

  const fromPaths = (task.allowedPaths ?? []).flatMap((path) => hits(PATH_HINTS, path));
  const fromPrompt = hits(PROMPT_HINTS, task.prompt);
  return [...new Set([...fromPaths, ...fromPrompt])].sort();
}

function coverageOf(profile: RuntimeProfile, required: readonly Capability[]): readonly Capability[] {
  const offered = new Set(profile.capabilities);
  return required.filter((capability) => offered.has(capability));
}

export function chooseRuntime(
  task: Pick<TaskContract, "capabilities" | "allowedPaths" | "prompt">,
  runtimes: readonly RuntimeProfile[],
  defaultRuntimeId: string,
): RuntimeChoice {
  const required = requiredCapabilities(task);
  if (required.length === 0 || runtimes.length === 0) {
    return { runtimeId: defaultRuntimeId, required, matched: [], missing: required, reason: "no capability was required" };
  }

  const ranked = runtimes
    .map((profile) => ({ profile, matched: coverageOf(profile, required) }))
    .filter((entry) => entry.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        a.profile.capabilities.length - b.profile.capabilities.length ||
        a.profile.id.localeCompare(b.profile.id),
    );

  const best = ranked[0];
  if (!best) {
    return {
      runtimeId: defaultRuntimeId,
      required,
      matched: [],
      missing: required,
      reason: `no runtime offers ${required.join(", ")}`,
    };
  }
  const matched = [...best.matched].sort();
  const missing = required.filter((capability) => !matched.includes(capability));
  return {
    runtimeId: best.profile.id,
    required,
    matched,
    missing,
    reason: `${best.profile.id} covers ${matched.join(", ")}`,
  };
}
