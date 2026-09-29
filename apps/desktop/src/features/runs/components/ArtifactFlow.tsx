import { useShallow } from "zustand/react/shallow";
import { useRunStore } from "../store";
import type { RunArtifactEntry } from "../types";

const NO_ARTIFACTS: readonly RunArtifactEntry[] = [];

function deliveryText(entry: RunArtifactEntry): string {
  return entry.deliveredTo.length > 0 ? `to ${entry.deliveredTo.join(", ")}` : "waiting for a consumer";
}

function ArtifactRow({ entry }: { readonly entry: RunArtifactEntry }) {
  const { artifact } = entry;
  return (
    <li className="flex flex-wrap gap-x-2" title={artifact.summary}>
      <span className="text-agent-text-bright">{artifact.name} v{artifact.version}</span>
      <span className="text-agent-text-faint">{artifact.kind}</span>
      <span>from {entry.producer}</span>
      <span>{deliveryText(entry)}</span>
    </li>
  );
}

export function ArtifactFlow() {
  const { artifacts, hiddenArtifactCount } = useRunStore(
    useShallow((state) => ({ artifacts: state.run?.artifacts ?? NO_ARTIFACTS, hiddenArtifactCount: state.run?.hiddenArtifactCount ?? 0 })),
  );
  if (artifacts.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1 text-[11px] text-agent-text-muted" role="group" aria-label="Published outputs">
      <span className="font-medium text-agent-text">Outputs published so far, routed by Weave</span>
      <ul className="flex flex-col gap-0.5">
        {artifacts.map((entry) => <ArtifactRow key={entry.key} entry={entry} />)}
      </ul>
      {hiddenArtifactCount > 0 && <span className="text-agent-text-faint">(+{hiddenArtifactCount} more)</span>}
    </div>
  );
}
