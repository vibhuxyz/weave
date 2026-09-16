function toRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === undefined) continue;

    if (char === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        if (pattern[i + 2] === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  source = source.replace(/\/\(\?:\.\*\/\)\?\.\*$/, "(?:/.*)?");
  source = source.replace(/\/\.\*$/, "(?:/.*)?");

  return new RegExp(`^${source}$`);
}

const cache = new Map<string, RegExp>();

function compiled(pattern: string): RegExp {
  let regex = cache.get(pattern);
  if (!regex) {
    regex = toRegExp(pattern);
    cache.set(pattern, regex);
  }
  return regex;
}

export function matchGlob(pattern: string, path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return compiled(pattern.replace(/^\.\//, "")).test(normalized);
}

export function firstMatch(
  patterns: readonly string[] | undefined,
  path: string,
): string | null {
  for (const pattern of patterns ?? []) {
    if (matchGlob(pattern, path)) return pattern;
  }
  return null;
}
