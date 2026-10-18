export { concurrencyFor, decide } from "./decide.ts";
export { overlapEdges, withOverlapEdges } from "./overlap-edges.ts";
export { hasPairwiseDisjointPaths, mayOverlap, tasksMayOverlap } from "./overlap.ts";
export { resolveWorkerCount } from "./worker-limits.ts";
export type { DecideInput, Decision, DecisionReason, WorkerCapacity, WorkerCount } from "./types.ts";
