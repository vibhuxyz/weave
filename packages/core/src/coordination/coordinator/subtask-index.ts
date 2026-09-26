const NOT_DECLARED = null;

function normalized(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function subtaskIndex(declared: readonly string[], reported: string): number | null {
  const exact = declared.indexOf(reported);
  if (exact !== -1) return exact;
  const target = normalized(reported);
  const loose = declared.findIndex((subtask) => normalized(subtask) === target);
  return loose === -1 ? NOT_DECLARED : loose;
}
