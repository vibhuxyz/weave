import { Spinner } from "@/shared/ui";
import type { HarnessInstallLog } from "./types";

interface HarnessTerminalLogProps {
  label: string;
  log: HarnessInstallLog;
}

export function HarnessTerminalLog({ label, log }: HarnessTerminalLogProps) {
  const isVerifying = log.phase === "verifying";
  const headerText = isVerifying
    ? "Verifying installation..."
    : `Installing ${label}...`;

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#121214] p-3.5 text-xs">
      <div className="flex items-center gap-2 text-zinc-300">
        <Spinner className="size-3.5 shrink-0 text-zinc-400" />
        <span className="font-medium">{headerText}</span>
      </div>

      <div className="flex flex-col gap-1 rounded-lg bg-[#18181b] p-3 font-mono text-[11px] leading-relaxed text-zinc-300 shadow-inner">
        {log.lines.map((line, idx) => {
          const isCommand = line.startsWith("$");
          const isProgress = line.startsWith(">");
          const isSuccess = line.includes("Happy coding");

          return (
            <div
              key={`${idx}-${line.slice(0, 10)}`}
              className={
                isSuccess
                  ? "mt-2 font-semibold text-emerald-400"
                  : isCommand
                    ? "font-medium text-zinc-200"
                    : isProgress
                      ? "text-zinc-400"
                      : "text-zinc-300"
              }
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
