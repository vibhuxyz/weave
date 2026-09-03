/**
 * A tiny in-memory stock ledger.
 *
 * Reservations are NOT implemented yet — see the README task.
 */
export function createInventory(initial = {}) {
  return { stock: { ...initial } };
}

export function onHand(inventory, sku) {
  return inventory.stock[sku] ?? 0;
}

export function receive(inventory, sku, quantity) {
  if (quantity <= 0) throw new Error("quantity must be positive");
  inventory.stock[sku] = onHand(inventory, sku) + quantity;
  return inventory;
}

export function ship(inventory, sku, quantity) {
  if (quantity > onHand(inventory, sku)) {
    throw new Error(`not enough ${sku}: have ${onHand(inventory, sku)}, want ${quantity}`);
  }
  inventory.stock[sku] = onHand(inventory, sku) - quantity;
  return inventory;
}
