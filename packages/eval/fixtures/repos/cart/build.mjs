/**
 * Build: close out a batch of carts and write the receipts to dist/.
 *
 * The check is independent of `total()`'s own formula: it recomputes the
 * expected total from `subtotal()` directly, so a bug inside `total()` cannot
 * also hide from the thing checking it.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { subtotal, total, round } from "./src/cart.js";

const TAX_RATE = 0.08;
const carts = [
  { items: [{ price: 10, quantity: 2 }, { price: 5.5, quantity: 4 }], discount: 0 },
  { items: [{ price: 10, quantity: 2 }, { price: 5.5, quantity: 4 }], discount: 10 },
  { items: [{ price: 20, quantity: 1 }], discount: 100 },
];

const problems = [];
const receipts = [];

for (const [index, cart] of carts.entries()) {
  const base = subtotal(cart.items);
  const expected = round((base - (base * cart.discount) / 100) * (1 + TAX_RATE));
  const actual = total(cart.items, cart.discount);

  if (actual !== expected) {
    problems.push(
      `cart ${index}: total() returned ${actual}, expected ${expected} ` +
        `(subtotal ${base}, discount ${cart.discount}%)`,
    );
  }
  if (actual < 0) problems.push(`cart ${index}: negative total ${actual}`);

  receipts.push({ cart: index, subtotal: base, total: actual });
}

if (problems.length > 0) {
  console.error("build failed: cart totals do not match subtotal + tax - discount");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(new URL("./dist/receipts.json", import.meta.url), JSON.stringify(receipts, null, 2));
console.log(`build ok: ${receipts.length} receipts`);
