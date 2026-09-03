/** Parse one line of CSV into fields. Quoted fields may contain commas. */
export function parseLine(line) {
  const fields = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    // BUG: splits on every comma, including commas inside a quoted field.
    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  fields.push(current);
  return fields;
}

export function parseAll(text) {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parseLine);
}
