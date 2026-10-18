const CONFLICT_MARKER = /^(?:<{7}|>{7})(?:[ \t]|\r?$)/m;

export function hasConflictMarkers(text: string): boolean {
  return CONFLICT_MARKER.test(text);
}
