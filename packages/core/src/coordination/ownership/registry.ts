import type { ResourceRef } from "@weave/protocol";
import { normalizeResource, resourcesOverlap } from "./overlap.ts";
import type { ClaimConflict, ClaimResult } from "./types.ts";

export class OwnershipRegistry {
  private readonly held = new Map<string, readonly ResourceRef[]>();

  claim(taskId: string, resources: readonly ResourceRef[]): ClaimResult {
    const wanted = resources.map(normalizeResource);
    const conflicts = this.conflictsFor(taskId, wanted);
    if (conflicts.length > 0) return { ok: false, conflicts };
    this.held.set(taskId, [...(this.held.get(taskId) ?? []), ...wanted]);
    return { ok: true, resources: wanted };
  }

  release(taskId: string): boolean {
    return this.held.delete(taskId);
  }

  ownerOf(resource: ResourceRef): string | null {
    const wanted = normalizeResource(resource);
    const owners = this.sortedHolders().filter(([, held]) => held.some((entry) => resourcesOverlap(entry, wanted)));
    return owners[0]?.[0] ?? null;
  }

  private conflictsFor(taskId: string, wanted: readonly ResourceRef[]): readonly ClaimConflict[] {
    const others = this.sortedHolders().filter(([holder]) => holder !== taskId);
    return wanted.flatMap((resource) =>
      others.flatMap(([heldBy, held]) =>
        held.filter((entry) => resourcesOverlap(entry, resource)).map((entry) => ({ resource, heldBy, held: entry })),
      ),
    );
  }

  private sortedHolders(): readonly (readonly [string, readonly ResourceRef[]])[] {
    return [...this.held.entries()].sort(([a], [b]) => a.localeCompare(b));
  }
}
