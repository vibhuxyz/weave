const QUOTED = /^"([\s\S]*)"$/;
const ESCAPE = /\\(?:([abfnrtv"\\])|([0-7]{3}))/g;

const SIMPLE: Readonly<Record<string, string>> = {
  a: "\u0007",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  '"': '"',
  "\\": "\\",
};

export function unquotePath(raw: string): string {
  const quoted = QUOTED.exec(raw);
  if (!quoted?.[1]) return raw;
  const bytes: number[] = [];
  let index = 0;
  const body = quoted[1];
  ESCAPE.lastIndex = 0;
  for (let match = ESCAPE.exec(body); match !== null; match = ESCAPE.exec(body)) {
    for (const char of body.slice(index, match.index)) bytes.push(...Buffer.from(char, "utf8"));
    if (match[1]) bytes.push(...Buffer.from(SIMPLE[match[1]] ?? match[1], "utf8"));
    else if (match[2]) bytes.push(Number.parseInt(match[2], 8));
    index = match.index + match[0].length;
  }
  for (const char of body.slice(index)) bytes.push(...Buffer.from(char, "utf8"));
  return Buffer.from(bytes).toString("utf8");
}
