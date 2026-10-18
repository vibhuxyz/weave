import type { DiffRange, DiffSource } from "../types";

export function sourceKey(source: DiffSource): string {
  switch (source.kind) {
    case "turn":
      return `turn:${source.turnId}`;
    case "working":
      return `working:${source.base ?? ""}`;
    case "commit":
      return `commit:${source.sha}`;
    case "range":
      return `range:${source.from}..${source.to}`;
    case "file":
      return `file:${source.path}`;
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

export function sourceRange(source: DiffSource): DiffRange | null {
  switch (source.kind) {
    case "working":
      return source.base === null ? { kind: "working" } : { kind: "branch", base: source.base };
    case "commit":
      return { kind: "commit", sha: source.sha };
    case "range":
      return { kind: "range", from: source.from, to: source.to };
    case "turn":
    case "file":
      return null;
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

export function contextRev(source: DiffSource): string | null {
  switch (source.kind) {
    case "working":
      return null;
    case "commit":
      return source.sha;
    case "range":
      return source.to;
    case "turn":
    case "file":
      return null;
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}
