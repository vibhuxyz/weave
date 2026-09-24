export type YamlResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: string };

interface Line {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
  readonly raw: string;
}

interface State {
  readonly lines: readonly Line[];
  index: number;
  error: string | null;
}

const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)[ \t]*:(?:[ \t]+(.*))?$/;
const LIST_ITEM = /^-(?:[ \t]+(.*))?$/;
const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+\.\d+$/;
const DOCUMENT_START = /^---[ \t]*$/;
const UNSUPPORTED_START = /^[&*!>{]/;
const BLOCK_LITERAL = /^\|(-?)$/;

function stripComment(text: string): string {
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(text[index - 1] ?? ""))) return text.slice(0, index);
  }
  return text;
}

function toLines(source: string): Line[] {
  return source.split(/\r?\n/).map((raw, index) => {
    const indent = raw.length - raw.trimStart().length;
    return { number: index + 1, indent, text: stripComment(raw.trimStart()).trimEnd(), raw };
  });
}

function fail(state: State, line: Line | undefined, message: string): null {
  state.error ??= `line ${line?.number ?? "end"}: ${message}`;
  return null;
}

function nextContent(state: State): Line | undefined {
  while (state.index < state.lines.length && state.lines[state.index]?.text === "") state.index += 1;
  return state.lines[state.index];
}

function parseQuoted(text: string): string | null {
  if (text.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "string" ? value : null;
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }
  return text.endsWith("'") && text.length >= 2 ? text.slice(1, -1).replaceAll("''", "'") : null;
}

function parseScalar(state: State, line: Line, text: string): unknown {
  if (UNSUPPORTED_START.test(text)) return fail(state, line, `unsupported YAML syntax ${JSON.stringify(text.slice(0, 20))}`);
  if (text.startsWith('"') || text.startsWith("'")) return parseQuoted(text) ?? fail(state, line, `unterminated or invalid quoted string`);
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) return fail(state, line, "unterminated inline list");
    const inner = text.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => parseScalar(state, line, item.trim()));
  }
  if (text === "true" || text === "false") return text === "true";
  if (text === "null" || text === "~") return null;
  if (INTEGER.test(text) || DECIMAL.test(text)) return Number(text);
  return text;
}

function parseBlockLiteral(state: State, parentIndent: number, isChomped: boolean): string {
  const collected: Line[] = [];
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (!line || (line.raw.trim() !== "" && line.indent <= parentIndent)) break;
    collected.push(line);
    state.index += 1;
  }
  const bodyIndent = Math.min(...collected.filter((line) => line.raw.trim() !== "").map((line) => line.indent));
  const text = collected.map((line) => line.raw.slice(Number.isFinite(bodyIndent) ? bodyIndent : 0)).join("\n").replace(/\n+$/, "");
  return isChomped || text === "" ? text : `${text}\n`;
}

function parseValue(state: State, line: Line, rest: string | undefined, indent: number): unknown {
  const text = rest?.trim() ?? "";
  const literal = BLOCK_LITERAL.exec(text);
  if (literal) return parseBlockLiteral(state, indent, literal[1] === "-");
  if (text !== "") return parseScalar(state, line, text);
  const next = nextContent(state);
  if (next && next.indent > indent) return parseBlock(state, next.indent);
  if (next && next.indent === indent && LIST_ITEM.test(next.text)) return parseList(state, indent);
  return null;
}

function parseList(state: State, indent: number): unknown[] {
  const items: unknown[] = [];
  for (let line = nextContent(state); line && line.indent === indent && !state.error; line = nextContent(state)) {
    const item = LIST_ITEM.exec(line.text);
    if (!item) break;
    state.index += 1;
    if (item[1] !== undefined && KEY_LINE.test(item[1])) return (fail(state, line, "lists of maps are not supported"), items);
    items.push(parseValue(state, line, item[1], indent));
  }
  return items;
}

function parseMap(state: State, indent: number): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (let line = nextContent(state); line && line.indent >= indent && !state.error; line = nextContent(state)) {
    if (line.indent > indent) return (fail(state, line, "unexpected indentation"), map);
    const entry = KEY_LINE.exec(line.text);
    if (!entry?.[1]) {
      if (LIST_ITEM.test(line.text)) break;
      return (fail(state, line, `expected "key: value", got ${JSON.stringify(line.text.slice(0, 40))}`), map);
    }
    if (Object.hasOwn(map, entry[1])) return (fail(state, line, `duplicate key "${entry[1]}"`), map);
    state.index += 1;
    map[entry[1]] = parseValue(state, line, entry[2], indent);
  }
  return map;
}

function parseBlock(state: State, indent: number): unknown {
  const first = nextContent(state);
  return first && LIST_ITEM.test(first.text) ? parseList(state, indent) : parseMap(state, indent);
}

export function parseYamlSubset(source: string): YamlResult {
  const lines = toLines(source);
  const tabbed = lines.find((line) => /^ *\t/.test(line.raw) && line.text !== "");
  if (tabbed) return { ok: false, issue: `line ${tabbed.number}: tabs are not allowed for indentation` };
  const state: State = { lines, index: 0, error: null };
  const first = nextContent(state);
  if (first && DOCUMENT_START.test(first.text)) state.index += 1;
  const start = nextContent(state);
  const value = start ? parseBlock(state, start.indent) : {};
  const leftover = nextContent(state);
  if (!state.error && leftover) fail(state, leftover, "unexpected content after the document");
  return state.error ? { ok: false, issue: state.error } : { ok: true, value };
}
