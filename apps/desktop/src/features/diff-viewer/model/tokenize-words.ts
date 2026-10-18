const WORD = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\s+|[^\s\w]/g;

export function tokenizeWords(text: string): readonly string[] {
  WORD.lastIndex = 0;
  const tokens: string[] = [];
  for (let match = WORD.exec(text); match !== null; match = WORD.exec(text)) {
    tokens.push(match[0]);
  }
  return tokens;
}
