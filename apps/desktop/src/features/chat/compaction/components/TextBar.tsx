import type { BarRun, BarTone } from "../lib";

export type BarAccent = "progress" | "success";

const TONE_CLASS = {
  progress: { solid: "text-agent-progress-fg", faded: "text-agent-progress-fg/45", empty: "text-agent-text-faint/40" },
  success: { solid: "text-agent-success", faded: "text-agent-success/35", empty: "text-agent-text-faint/40" },
} as const satisfies Record<BarAccent, Record<BarTone, string>>;

export function TextBar({ runs, accent }: { readonly runs: readonly BarRun[]; readonly accent: BarAccent }) {
  return (
    <span aria-hidden="true" className="block whitespace-pre">
      <span className="text-agent-text-faint">[</span>
      {runs.map((part, index) => (
        <span key={`${part.tone}-${index}`} className={TONE_CLASS[accent][part.tone]}>
          {part.text}
        </span>
      ))}
      <span className="text-agent-text-faint">]</span>
    </span>
  );
}
