/**
 * Order summaries.
 *
 * Three functions that differ only in which status they count. Adding a fourth
 * status means a fourth copy.
 */
export function countPending(orders) {
  let count = 0;
  let value = 0;
  for (const order of orders) {
    if (order.status !== "pending") continue;
    count += 1;
    value += order.total;
  }
  return { count, value: Math.round(value * 100) / 100 };
}

export function countShipped(orders) {
  let count = 0;
  let value = 0;
  for (const order of orders) {
    if (order.status !== "shipped") continue;
    count += 1;
    value += order.total;
  }
  return { count, value: Math.round(value * 100) / 100 };
}

export function countCancelled(orders) {
  let count = 0;
  let value = 0;
  for (const order of orders) {
    if (order.status !== "cancelled") continue;
    count += 1;
    value += order.total;
  }
  return { count, value: Math.round(value * 100) / 100 };
}
