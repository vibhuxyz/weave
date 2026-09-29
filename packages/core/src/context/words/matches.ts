import { wordsOf } from "./words.ts";

const MIN_ABBREVIATION_LENGTH = 4;

function matchesTerm(word: string, term: string): boolean {
  if (word === term) return true;
  const shorter = word.length <= term.length ? word : term;
  const longer = word.length <= term.length ? term : word;
  return shorter.length >= MIN_ABBREVIATION_LENGTH && longer.startsWith(shorter);
}

export function matchingTerms(terms: readonly string[], text: string): readonly string[] {
  const words = wordsOf(text);
  const exact = new Set(words);
  return terms.filter((term) => exact.has(term) || words.some((word) => matchesTerm(word, term)));
}
