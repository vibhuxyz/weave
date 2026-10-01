import { selectRepoSetup, useRunStore } from "../store";

export function RepoSetupNote() {
  const summary = useRunStore(selectRepoSetup);
  if (summary === null) return null;
  return (
    <p role="note" className="text-agent-text-muted text-xs">
      {summary}
    </p>
  );
}
