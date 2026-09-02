export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  // BUG: returns the operands added instead of subtracted.
  return a + b;
}

export function percentOf(value, percent) {
  return (value * percent) / 100;
}
