import type { EmployeeEventType, ResourceKind } from "./types.ts";

export const WEAVE_SENDER = "weave";

export const COORDINATION_EVENT_VERSION = 1;

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  "file",
  "directory",
  "module",
  "symbol",
  "api",
  "event",
  "schema",
  "resource",
] as const;

export const EMPLOYEE_EVENT_TYPES: readonly EmployeeEventType[] = [
  "task.blocked",
  "artifact.ready",
  "artifact.updated",
  "contract.published",
  "contract.changed",
  "dependency.blocked",
  "review.requested",
  "verification.failed",
  "verification.passed",
  "escalation.created",
] as const;
