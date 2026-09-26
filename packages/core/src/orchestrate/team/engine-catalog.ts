import type { EngineCandidate } from "../../adaptive/index.ts";

const MAX_LISTED_CAPABILITIES = 6;

function capabilityNames(candidate: EngineCandidate): readonly string[] {
  return Object.entries(candidate.capabilities)
    .filter(([, isDeclared]) => isDeclared)
    .map(([name]) => name)
    .sort()
    .slice(0, MAX_LISTED_CAPABILITIES);
}

export function engineIdsOf(candidates: readonly EngineCandidate[]): readonly string[] {
  return candidates.map((candidate) => candidate.id);
}

export function renderEngineCatalog(candidates: readonly EngineCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const lines = [...candidates]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((candidate) => {
      const names = capabilityNames(candidate);
      return names.length > 0 ? `- ${candidate.id}: ${names.join(", ")}` : `- ${candidate.id}`;
    });
  return ["Engines installed for this run, with the capabilities each declares:", ...lines].join("\n");
}
