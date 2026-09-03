export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function min(values) {
  return values.length === 0 ? 0 : Math.min(...values);
}

export function max(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}
