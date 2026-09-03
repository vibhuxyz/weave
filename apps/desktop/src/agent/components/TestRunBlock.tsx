import {
  CheckIcon,
  CircleIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";
import type { TestRunBlock as TestRunBlockModel } from "../normalize/types";

function statusIcon(status: TestRunBlockModel["steps"][number]["status"]) {
  if (status === "completed") return CheckIcon;
  if (status === "failed") return XIcon;
  return CircleIcon;
}

export function TestRunBlock({ block }: { block: TestRunBlockModel }) {
  const failing = block.steps.filter((step) => step.status === "failed").length;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-4">
          <p className="font-mono text-emerald-300 text-[11px] uppercase tracking-[0.08em]">
            Commands
          </p>
          <p className="mt-2 font-mono text-sm text-white">{block.steps.length} steps</p>
        </div>
        <div className="rounded-lg border border-blue-500/25 bg-blue-500/8 p-4">
          <p className="font-mono text-blue-300 text-[11px] uppercase tracking-[0.08em]">
            Status
          </p>
          <p className="mt-2 font-mono text-sm text-white">{block.status}</p>
        </div>
        <div className="rounded-lg border border-[#ff6f6f]/25 bg-[#ff6f6f]/8 p-4">
          <p className="font-mono text-[#ff9b9b] text-[11px] uppercase tracking-[0.08em]">
            Problems
          </p>
          <p className="mt-2 font-mono text-sm text-white">{failing}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-muted-foreground text-[11px] uppercase tracking-[0.08em]">
            Run log
          </p>
          <span className="font-mono text-muted-foreground text-xs">
            {failing} failing · {block.steps.length} steps
          </span>
        </div>
        <div className="space-y-2">
          {block.steps.map((step) => {
            const Icon = statusIcon(step.status);
            return (
              <div
                key={step.id}
                className={cn(
              "flex items-center gap-3 rounded-lg border border-white/10 bg-[#181820] px-3 py-2 font-mono text-xs",
              step.status === "failed" &&
                    "border-[#ff6f6f]/50 bg-[#2a151a]",
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    step.status === "completed" && "text-[#74e0a3]",
                    step.status === "failed" && "text-[#ff8b8b]",
                    (step.status === "pending" ||
                      step.status === "in_progress") &&
                      "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[#ded8e4]">{step.label}</span>
                <Badge variant="secondary" className="border-[#383341] bg-[#24232d] text-[#a8a2b3]">
                  <TerminalIcon />
                  {step.kind}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
