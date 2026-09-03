const TAX_RATE = 0.08;

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Total for a cart, with an optional percentage discount.
 *
 * Tax is charged on the discounted amount — you do not pay tax on money you
 * did not spend.
 */
export function total(items, discountPercent = 0) {
  const base = subtotal(items);
  // BUG: tax is computed on the pre-discount subtotal, so every discounted
  // cart is overcharged.
  const tax = base * TAX_RATE;
  const discount = (base * discountPercent) / 100;
  return round(base - discount + tax);
}

export function round(value) {
  return Math.round(value * 100) / 100;
}
