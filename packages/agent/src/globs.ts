/**
 * A small glob matcher, for path policy only.
 *
 * Deliberately not a dependency. `packages/agent` sits under `protocol` in the
 * dependency rule and the whole matcher is forty lines; pulling in minimatch to
 * decide whether `tests/calc.test.js` is inside `tests/**` would be trading a
 * supply-chain surface for nothing.
 *
 * Supported, and nothing else:
 *   *      one path segment, no slashes
 *   **     any number of segments, slashes included
 *   ?      one character, not a slash
 *
 * `dir/**` also matches `dir` itself. On a DENY list that is the safe reading:
 * a rule meaning "nothing under tests" should not leave the directory entry
 * itself writable.
 */

function toRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];

    if (char === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        // `foo/**` → `foo(?:/.*)?` so the directory itself is covered too.
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

  // `tests/**` compiled to `tests/(?:.*/)?.*` still requires the slash. Allow
  // the bare directory by making a trailing `/**` optional.
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

/** Does `path` (relative, POSIX separators) match `pattern`? */
export function matchGlob(pattern: string, path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return compiled(pattern.replace(/^\.\//, "")).test(normalized);
}

/** The first pattern that matches, or null. Returned so the reason can name it. */
export function firstMatch(
  patterns: readonly string[] | undefined,
  path: string,
): string | null {
  for (const pattern of patterns ?? []) {
    if (matchGlob(pattern, path)) return pattern;
  }
  return null;
}
