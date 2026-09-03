import { FolderTreeIcon } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import type { ProjectOverviewBlock as ProjectOverviewBlockModel } from "../normalize/types";
import { Prose } from "./Prose";

export function ProjectOverviewBlockView({
  block,
}: {
  block: ProjectOverviewBlockModel;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <p className="font-mono text-agent-accent text-[11px] uppercase tracking-[0.08em]">
          Project overview
        </p>
        <p className="text-base font-semibold leading-7 text-agent-text-bright">
          {block.description.replace(/\*\*|__|`/g, "")}
        </p>
      </div>

      {block.tree && (
        <section className="overflow-hidden rounded-lg border border-agent-code-border bg-agent-code-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center gap-2 border-agent-code-border border-b bg-agent-code-header-bg px-3 py-2">
            <FolderTreeIcon className="size-3.5 text-agent-low-fg" />
            <span className="font-mono text-agent-text text-xs">
              Directory &amp; file map
            </span>
          </div>
          <pre className="max-h-[26rem] overflow-auto p-3 font-mono text-agent-text-strong text-xs leading-6">
            <code>{block.tree}</code>
          </pre>
        </section>
      )}

      {block.sections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="shrink-0 font-mono text-agent-text-muted text-[10px] uppercase tracking-[0.08em]">
              Breakdown
            </p>
            <div className="h-px flex-1 bg-agent-border-subtle" />
            <p className="shrink-0 font-mono text-agent-text-muted text-[10px]">
              {block.sections.length} section
              {block.sections.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="space-y-2">
            {block.sections.map((section, index) => (
              <div
                key={`${section.title}-${index}`}
                className="rounded-lg border border-agent-border-subtle bg-agent-surface-inset p-3"
              >
                <div className="flex items-center gap-2">
                  {section.icon ? (
                    <span className="text-sm">{section.icon}</span>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="border-agent-chip-border bg-agent-chip-bg font-mono text-[10px] text-agent-text-muted"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </Badge>
                  )}
                  <p className="min-w-0 font-medium text-sm text-agent-text-strong">
                    {section.title}
                  </p>
                </div>
                <div className="mt-2.5 border-agent-border-subtle border-t pt-2.5">
                  <Prose size="xs">{section.content}</Prose>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
