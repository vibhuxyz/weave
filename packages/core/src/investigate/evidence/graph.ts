import type { Evidence, EvidenceGraph, EvidenceLink, EvidenceNode, Finding } from "../types.ts";

export function evidenceKey(evidence: Evidence): string {
  return evidence.symbol ? `${evidence.file}#${evidence.symbol}` : evidence.file;
}

function fileNodeId(file: string): string {
  return `file:${file}`;
}

function symbolNodeId(key: string): string {
  return `symbol:${key}`;
}

function findingNodeId(id: string): string {
  return `finding:${id}`;
}

export interface RejectedFinding {
  readonly worker: string;
  readonly reason: string;
}

function nodesOf(findings: readonly Finding[]): EvidenceNode[] {
  const byId = new Map<string, EvidenceNode>();
  const add = (node: EvidenceNode) => {
    if (!byId.has(node.id)) byId.set(node.id, node);
  };
  for (const finding of findings) {
    add({ id: findingNodeId(finding.id), kind: "finding", label: finding.finding });
    for (const evidence of finding.evidence) {
      add({ id: fileNodeId(evidence.file), kind: "file", label: evidence.file });
      if (evidence.symbol) add({ id: symbolNodeId(evidenceKey(evidence)), kind: "symbol", label: evidence.symbol });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function supportLinks(findings: readonly Finding[]): EvidenceLink[] {
  return findings.flatMap((finding) =>
    finding.evidence.flatMap((evidence) => {
      const file = fileNodeId(evidence.file);
      const source = findingNodeId(finding.id);
      if (!evidence.symbol) return [{ from: source, to: file, kind: "supports" as const }];
      const symbol = symbolNodeId(evidenceKey(evidence));
      return [
        { from: source, to: symbol, kind: "supports" as const },
        { from: file, to: symbol, kind: "contains" as const },
      ];
    }),
  );
}

function corroborationLinks(findings: readonly Finding[]): EvidenceLink[] {
  const byKey = new Map<string, string[]>();
  for (const finding of findings) {
    for (const key of new Set(finding.evidence.map(evidenceKey))) {
      byKey.set(key, [...(byKey.get(key) ?? []), finding.id]);
    }
  }
  const links: EvidenceLink[] = [];
  for (const ids of byKey.values()) {
    const unique = [...new Set(ids)].sort();
    for (let left = 0; left < unique.length; left += 1) {
      for (let right = left + 1; right < unique.length; right += 1) {
        const from = unique[left];
        const to = unique[right];
        if (from && to) links.push({ from: findingNodeId(from), to: findingNodeId(to), kind: "corroborates" });
      }
    }
  }
  return links;
}

function uniqueLinks(links: readonly EvidenceLink[]): EvidenceLink[] {
  const byKey = new Map<string, EvidenceLink>();
  for (const link of links) {
    const key = `${link.from}|${link.kind}|${link.to}`;
    if (!byKey.has(key)) byKey.set(key, link);
  }
  return [...byKey.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.kind.localeCompare(b.kind) || a.to.localeCompare(b.to),
  );
}

export function buildEvidenceGraph(
  findings: readonly Finding[],
  rejected: readonly RejectedFinding[] = [],
): EvidenceGraph {
  const sorted = [...findings].sort((a, b) => a.id.localeCompare(b.id));
  return {
    findings: sorted,
    nodes: nodesOf(sorted),
    links: uniqueLinks([...supportLinks(sorted), ...corroborationLinks(sorted)]),
    rejected: [...rejected].sort((a, b) => a.worker.localeCompare(b.worker) || a.reason.localeCompare(b.reason)),
  };
}
