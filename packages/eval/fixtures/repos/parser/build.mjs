/**
 * Build: turn data/contacts.csv into dist/contacts.json.
 *
 * The gate is arity. Every row must produce exactly as many fields as the
 * header declares — a CSV row that yields five columns against a three-column
 * header is not something to write to disk and discover downstream.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseAll } from "./src/parser.js";

const csv = await readFile(new URL("./data/contacts.csv", import.meta.url), "utf8");
const rows = parseAll(csv);
const [header, ...body] = rows;

const problems = [];
for (const [index, row] of body.entries()) {
  if (row.length !== header.length) {
    problems.push(
      `row ${index + 2}: ${row.length} fields, header declares ${header.length} — ${JSON.stringify(row)}`,
    );
  }
}

if (problems.length > 0) {
  console.error("build failed: rows do not match the header");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const records = body.map((row) =>
  Object.fromEntries(header.map((key, index) => [key, row[index]])),
);

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/contacts.json", import.meta.url),
  JSON.stringify(records, null, 2),
);
console.log(`build ok: ${records.length} contacts`);
