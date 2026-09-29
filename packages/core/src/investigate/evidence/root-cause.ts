import { CONFIDENCE_WEIGHT, MAX_ROOT_CAUSES } from "../constants.ts";
import type { EvidenceGraph, Finding, RootCause, RootCauseReport } from "../types.ts";
import { evidenceKey } from "./graph.ts";

interface Cluster {
  readonly findings: Finding[];
  readonly keys: Set<string>;
}

function keysOf(finding: Finding): Set<string> {
  return new Set(finding.evidence.map(evidenceKey));
}

function shares(cluster: Cluster, keys: ReadonlySet<string>): boolean {
  for (const key of keys) if (cluster.keys.has(key)) return true;
  return false;
}

function clusterFindings(findings: readonly Finding[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const finding of findings) {
    const keys = keysOf(finding);
    const joined = clusters.filter((cluster) => shares(cluster, keys));
    if (joined.length === 0) {
      clusters.push({ findings: [finding], keys });
      continue;
    }
    const [first, ...rest] = joined;
    if (!first) continue;
    first.findings.push(finding);
    for (const key of keys) first.keys.add(key);
    for (const other of rest) {
      first.findings.push(...other.findings);
      for (const key of other.keys) first.keys.add(key);
      clusters.splice(clusters.indexOf(other), 1);
    }
  }
  return clusters;
}

function confidenceOf(finding: Finding): number {
  return CONFIDENCE_WEIGHT[finding.confidence] ?? 1;
}

function hypothesisOf(findings: readonly Finding[]): string {
  const stated = [...findings]
    .filter((finding) => finding.hypothesis !== null)
    .sort((a, b) => confidenceOf(b) - confidenceOf(a) || a.id.localeCompare(b.id));
  const best = stated[0]?.hypothesis;
  if (best) return best;
  return [...findings].sort((a, b) => confidenceOf(b) - confidenceOf(a) || a.id.localeCompare(b.id))[0]?.finding ?? "";
}

function causeOf(cluster: Cluster): RootCause {
  const questionIds = [...new Set(cluster.findings.map((finding) => finding.questionId))].sort();
  const confidence = cluster.findings.reduce((total, finding) => total + confidenceOf(finding), 0);
  const shared = [...cluster.keys]
    .filter((key) => cluster.findings.filter((finding) => keysOf(finding).has(key)).length > 1)
    .sort();
  return {
    hypothesis: hypothesisOf(cluster.findings),
    score: confidence * questionIds.length * (1 + shared.length),
    supportedBy: [...new Set(cluster.findings.map((finding) => finding.id))].sort(),
    questionIds,
    sharedEvidence: shared,
  };
}

export function proposeRootCause(
  graph: EvidenceGraph,
  request: string,
  askedQuestionIds: readonly string[] = [],
): RootCauseReport {
  const answered = new Set(graph.findings.map((finding) => finding.questionId));
  const causes = clusterFindings(graph.findings)
    .map(causeOf)
    .sort((a, b) => b.score - a.score || a.hypothesis.localeCompare(b.hypothesis))
    .slice(0, MAX_ROOT_CAUSES);
  return {
    request,
    causes,
    unanswered: [...askedQuestionIds].filter((id) => !answered.has(id)).sort(),
  };
}
