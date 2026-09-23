const DRAFT_SEPARATOR = "\n\n";

export function mergeDraftText(current: string, withdrawn: string): string {
  if (!withdrawn.trim() || current.includes(withdrawn)) return current;
  if (!current.trim()) return withdrawn;
  return `${withdrawn}${DRAFT_SEPARATOR}${current}`;
}

export function mergeDraftImages<T extends { readonly previewUrl: string }>(
  current: readonly T[],
  withdrawn: readonly T[],
): T[] {
  const present = new Set(current.map((image) => image.previewUrl));
  const restored = withdrawn.filter((image) => !present.has(image.previewUrl));
  return [...restored, ...current];
}
