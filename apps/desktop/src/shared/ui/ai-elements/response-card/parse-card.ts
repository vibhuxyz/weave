import { MAX_BADGE_CHARS } from "./constants";
import type { ResponseCardData, ResponseCardLink } from "./types";

const HEADING = /^#{2,4}\s+(\d+)\.\s+(.+?)\s*$/;
const BADGE_ONLY = /^`([^`\n]+)`$/;
const LINK_ONLY = /^\[([^\]\n]+)\]\(([^()\s]+)\)$/;
const CAVEAT = /^>\s?(.*)$/;

function takeCaveat(lines: readonly string[]): { body: string[]; caveat: string[] } {
  const body: string[] = [];
  const caveat: string[] = [];
  for (const line of lines) {
    const quoted = CAVEAT.exec(line);
    if (quoted) caveat.push(quoted[1] ?? "");
    else body.push(line);
  }
  return { body, caveat };
}

function takeLink(lines: readonly string[]): { rest: string[]; link?: ResponseCardLink } {
  const rest = [...lines];
  while (rest.length > 0 && (rest.at(-1) ?? "").trim() === "") rest.pop();
  const last = rest.at(-1)?.trim() ?? "";
  const match = LINK_ONLY.exec(last);
  if (!match?.[1] || !match[2]) return { rest };
  rest.pop();
  return { rest, link: { label: match[1], href: match[2] } };
}

export function parseCard(source: string): ResponseCardData | null {
  const lines = source.split(/\r?\n/);
  const headingLine = lines.find((line) => line.trim().length > 0);
  if (headingLine === undefined) return null;
  const heading = HEADING.exec(headingLine.trim());
  if (!heading?.[1] || !heading[2]) return null;

  const after = lines.slice(lines.indexOf(headingLine) + 1);
  const firstContent = after.findIndex((line) => line.trim().length > 0);
  const badgeMatch = firstContent === -1 ? null : BADGE_ONLY.exec((after[firstContent] ?? "").trim());
  const badge = badgeMatch?.[1] && badgeMatch[1].length <= MAX_BADGE_CHARS ? badgeMatch[1] : undefined;
  const remainder = badge ? after.slice(firstContent + 1) : after;

  const withoutLink = takeLink(remainder);
  const split = takeCaveat(withoutLink.rest);
  const caveat = split.caveat.join("\n").trim();

  return {
    index: heading[1],
    title: heading[2],
    ...(badge ? { badge } : {}),
    body: split.body.join("\n").trim(),
    ...(caveat ? { caveat } : {}),
    ...(withoutLink.link ? { link: withoutLink.link } : {}),
  };
}
