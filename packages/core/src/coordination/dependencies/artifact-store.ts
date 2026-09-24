import type { Artifact } from "@weave/protocol";
import type { ArtifactInput, ArtifactKind } from "./types.ts";

interface StoredArtifact {
  readonly producer: string;
  readonly kind: ArtifactKind;
  readonly artifact: Artifact;
}

export interface PublishedArtifact extends StoredArtifact {
  readonly isUpdate: boolean;
}

export function artifactKey(producer: string, name: string): string {
  return `${producer}/${name}`;
}

export class ArtifactStore {
  private readonly latestByKey = new Map<string, StoredArtifact>();

  publish(producer: string, kind: ArtifactKind, input: ArtifactInput): PublishedArtifact {
    const key = artifactKey(producer, input.name);
    const previous = this.latestByKey.get(key);
    const version = (previous?.artifact.version ?? 0) + 1;
    const artifact: Artifact = { name: input.name, version, summary: input.summary, files: input.files.map((file) => ({ ...file })) };
    const stored: StoredArtifact = { producer, kind: previous?.kind ?? kind, artifact };
    this.latestByKey.set(key, stored);
    return { ...stored, isUpdate: previous !== undefined };
  }

  latestVersion(key: string): number {
    return this.latestByKey.get(key)?.artifact.version ?? 0;
  }

  latestOf(producer: string, name: string): Artifact | null {
    return this.latestByKey.get(artifactKey(producer, name))?.artifact ?? null;
  }

  producersOf(output: string): readonly string[] {
    return [...this.latestByKey.values()]
      .filter((stored) => stored.artifact.name === output)
      .map((stored) => stored.producer)
      .sort();
  }

  outputsByProducer(): ReadonlyMap<string, ReadonlySet<string>> {
    const outputs = new Map<string, Set<string>>();
    for (const stored of this.latestByKey.values()) {
      const names = outputs.get(stored.producer) ?? new Set<string>();
      names.add(stored.artifact.name);
      outputs.set(stored.producer, names);
    }
    return outputs;
  }
}
