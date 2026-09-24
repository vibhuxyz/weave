import type { Intent, RequestTerms } from "./types.ts";

const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "to", "of", "for", "in", "on", "at", "by", "and", "or", "with", "from", "into", "so", "it", "its", "this", "that", "these", "those",
  "change", "update", "modify", "fix", "add", "remove", "delete", "make", "improve", "refactor", "implement", "support", "handle", "use", "create", "rename",
  "please", "should", "can", "could", "would", "we", "i", "my", "our", "new", "all", "some", "when", "how", "what", "is", "are", "be", "not", "no", "yes",
]);

const INTENT_WORDS: Readonly<Record<string, Intent>> = {
  api: "api", apis: "api", endpoint: "api", endpoints: "api", route: "api", routes: "api", http: "api", rest: "api",
  ui: "ui", page: "ui", screen: "ui", component: "ui", button: "ui", form: "ui", view: "ui",
  db: "data", database: "data", table: "data", schema: "data", migration: "data", model: "data", query: "data",
  event: "event", events: "event", webhook: "event", webhooks: "event", queue: "event",
  test: "test", tests: "test", spec: "test",
};

const MIN_SINGULAR_LENGTH = 4;

export function singular(word: string): string {
  if (word.length <= MIN_SINGULAR_LENGTH) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1)
    .map(singular);
}

export function requestTermsOf(request: string): RequestTerms {
  const raw = request.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
  const intents = new Set(raw.flatMap((word) => INTENT_WORDS[word] ?? []));
  const terms = [...new Set(raw.filter((word) => !STOPWORDS.has(word) && !(word in INTENT_WORDS)).map(singular))];
  return { terms, intents };
}
