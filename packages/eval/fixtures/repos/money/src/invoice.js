/**
 * Invoice rendering.
 *
 * Note the money formatting logic, copy-pasted three times with small drifts.
 */
export function renderLine(item) {
  const cents = Math.round(item.amount * 100);
  const formatted = `$${(cents / 100).toFixed(2)}`;
  return `${item.name}  ${formatted}`;
}

export function renderTotal(items) {
  const sum = items.reduce((total, item) => total + item.amount, 0);
  const cents = Math.round(sum * 100);
  const formatted = `$${(cents / 100).toFixed(2)}`;
  return `TOTAL  ${formatted}`;
}

export function renderRefund(amount) {
  const cents = Math.round(amount * 100);
  const formatted = `-$${(cents / 100).toFixed(2)}`;
  return `REFUND  ${formatted}`;
}
