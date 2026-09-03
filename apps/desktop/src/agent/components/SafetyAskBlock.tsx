import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { SafetyAskBlock as SafetyAskBlockModel } from "../normalize/types";

export function SafetyAskBlock({ block }: { block: SafetyAskBlockModel }) {
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-[#ff7a66]/35 bg-[#2a171c] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="outline" className="border-[#ff7a66]/60 text-[#ff9b8c]">
            {block.title}
          </Badge>
          <span className="text-[#a8a2b3] text-xs">no commands run</span>
        </div>
        <p className="text-base font-medium leading-7 text-white">{block.body}</p>
      </div>

      {block.concerns.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-muted-foreground text-[11px] uppercase tracking-[0.08em]">
            What concerns me
          </p>
          {block.concerns.map((concern, index) => (
            <div
              key={`${concern.title}-${index}`}
              className="rounded-lg border border-[#ff6f6f]/35 bg-[#1f171d] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 font-medium text-sm">
                  <span className="mr-3 font-mono text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {concern.title}
                </p>
                <Badge variant="outline" className="border-[#ff6f6f]/45 text-[#ff9b9b]">
                  {concern.tag}
                </Badge>
              </div>
              {concern.evidence && (
                <pre className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-[#0f0f14] p-3 text-[#d7d1dc] text-xs">
                  <code>{concern.evidence}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-[#f0845d]/40 bg-[#181820] p-4">
        <h3 className="font-semibold text-sm text-white">Before I go further, what is the context?</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {block.choices.map((choice) => (
            <Button key={choice} type="button" size="xs" variant="ghost">
              {choice}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
