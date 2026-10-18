export interface SkillOption {
  readonly name: string;
  readonly description?: string;
}

export interface SkillChoice extends SkillOption {
  readonly isSelected: boolean;
  readonly isFound: boolean;
}

export function toggledSkills(selected: readonly string[], name: string): string[] {
  const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
  return [...new Set(next)].sort();
}

function matchesQuery(option: SkillOption, words: readonly string[]): boolean {
  const text = `${option.name}\n${option.description ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

export function skillChoices(catalog: readonly SkillOption[], selected: readonly string[], query: string): readonly SkillChoice[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  const chosen = new Set(selected);
  const known = new Set(catalog.map((option) => option.name));
  const missing = selected.filter((name) => !known.has(name)).sort();
  const missingChoices = missing.filter((name) => matchesQuery({ name }, words)).map((name) => ({ name, isSelected: true, isFound: false }));
  const foundChoices = catalog
    .filter((option) => matchesQuery(option, words))
    .map((option) => ({ ...option, isSelected: chosen.has(option.name), isFound: true }));
  return [...missingChoices, ...foundChoices];
}
