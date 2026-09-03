const DAY_MS = 24 * 60 * 60 * 1000;

/** Every date from `start` to `end`, INCLUSIVE of both ends. */
export function rangeOf(start, end) {
  const days = [];
  const from = new Date(start);
  const to = new Date(end);
  // BUG: strictly less-than drops the final day, so the range is
  // half-open when the contract says inclusive.
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** Number of days covered by an inclusive range. */
export function lengthOf(start, end) {
  return rangeOf(start, end).length;
}
