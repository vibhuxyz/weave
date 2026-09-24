import type { ProjectAnswer } from "./types.ts";

const MAX_CONTEXT_BYTES = 8_000;
const CLOSING_TAG = "</project-context>";
const SHORT_SHA_LENGTH = 8;

function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim().replaceAll(CLOSING_TAG, "<\\/project-context>");
}

function section(title: string, lines: readonly string[]): readonly string[] {
  return lines.length === 0 ? [] : [`${title}:`, ...lines.map((line) => `- ${flat(line)}`)];
}

function sectionsOf(answer: ProjectAnswer): readonly (readonly string[])[] {
  const { dependencies, verification } = answer;
  return [
    [`Search terms: ${answer.terms.join(", ") || "none"}`, flat(`Application: ${answer.application ? `${answer.application.name} (${answer.application.dir}, ${answer.application.kind})` : "not identified"}`)],
    section("Relevant files", answer.files.map((file) => `${file.path} (matched ${file.matchedTerms.join(", ")}; ${file.reasons.join("; ")})`)),
    section("Relevant symbols", answer.symbols.map(({ symbol }) => `${symbol.kind} ${symbol.name} (${symbol.file}:${symbol.line}${symbol.isExported ? ", exported" : ""})`)),
    section("API routes and contracts", answer.apis.map((api) => `${api.method} ${api.path} (${api.source}, ${api.file}:${api.line}${api.handler ? `, ${api.handler}` : ""})`)),
    section("Events", answer.events.map((event) => `${event.role} ${event.name} (${event.file}:${event.line})`)),
    section("Imports used by these files", dependencies.imports),
    section("Files that depend on them", dependencies.dependents),
    section("Callers", dependencies.callers),
    section("Callees", dependencies.callees),
    section("Recent changes", answer.recentChanges.map((commit) => `${commit.sha.slice(0, SHORT_SHA_LENGTH)} ${commit.at.slice(0, 10)} ${commit.subject} (${commit.files.join(", ")})`)),
    section("Verification", [...verification.tests.map((test) => `test ${test}`), ...verification.commands.map((step) => `\`${step.command}\` in ${step.cwd}`)]),
  ];
}

function withinBudget(lines: readonly string[], maxBytes: number): { readonly text: string; readonly cutLines: number } {
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(`${line}\n`, "utf8");
    if (bytes + size > maxBytes) break;
    kept.push(line);
    bytes += size;
  }
  return { text: kept.join("\n"), cutLines: lines.length - kept.length };
}

export function renderProjectContext(answer: ProjectAnswer, maxBytes = MAX_CONTEXT_BYTES): string {
  const { text, cutLines } = withinBudget(sectionsOf(answer).flat(), maxBytes);
  const note = cutLines > 0 ? `\n(${cutLines} more lines cut to stay under ${maxBytes} bytes)` : "";
  return `<project-context source="Weave project model: parsed from the repository, not written by a model">\n${text}${note}\n${CLOSING_TAG}`;
}
