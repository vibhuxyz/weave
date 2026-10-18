import type { LimitScope } from "../lib";

export const SCOPE_TEXT: Readonly<Record<LimitScope, { readonly label: string; readonly hint: string }>> = {
  project: { label: "Whole project", hint: "Everything the recorded runs have spent. A run that would go over skips its tasks." },
  run: { label: "Each run", hint: "One team run from start to finish. Going over stops the run." },
  task: { label: "Each task", hint: "One task in a run. Going over stops that task." },
  employee: { label: "Each kind of work", hint: "Tasks of the same kind, such as backend or UI, within one run." },
};

export const MAX_ENGINE_ROWS = 32;
