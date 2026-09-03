import { Badge } from "@/shared/ui/badge";
import type { ExplanationBlock as ExplanationBlockModel } from "../normalize/types";
import { CodeBlockView } from "./CodeBlockView";
import { Prose } from "./Prose";

export function ExplanationBlock({
  block,
}: {
  block: ExplanationBlockModel;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <p className="font-mono text-agent-accent text-[11px] uppercase tracking-[0.08em]">
          In one line
        </p>
        <p className="text-base font-semibold leading-7 text-agent-text-bright">{block.oneLine}</p>
        <div className="flex flex-wrap gap-2">
          {block.sections.map((section) => (
            <Badge
              key={`${section.type}-${section.title}`}
              variant="secondary"
              className="border-agent-chip-border bg-agent-chip-bg text-agent-text-strong"
            >
              {section.title}
            </Badge>
          ))}
        </div>
      </div>

      {block.sections.map((section) => {
        if (section.type === "constants") {
          return (
            <section key={section.title} className="space-y-3">
              <h3 className="font-semibold text-lg text-agent-text-bright">{section.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border border-agent-chip-border bg-agent-surface-inset p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <p className="font-mono text-agent-accent text-xs">{item.name}</p>
                    <p className="mt-4 font-semibold text-3xl text-agent-text-bright">{item.value}</p>
                    {item.description && (
                      <p className="mt-2 text-agent-text-muted text-xs">
                        {item.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (section.type === "code") {
          return (
            <section key={section.title} className="space-y-3">
              <h3 className="font-semibold text-lg text-agent-text-bright">{section.title}</h3>
              <CodeBlockView
                block={{
                  id: `${block.id}-${section.title}`,
                  schemaVersion: 1,
                  source: block.source,
                  sourceEventIds: block.sourceEventIds,
                  sourceSeq: block.sourceSeq,
                  type: "code",
                  title: section.title,
                  file: section.file,
                  language: section.language,
                  code: section.code,
                }}
              />
            </section>
          );
        }

        if (section.type === "math") {
          return (
            <section key={section.title} className="space-y-3">
              <h3 className="font-semibold text-lg text-agent-text-bright">{section.title}</h3>
              <div className="rounded-lg border border-agent-chip-border bg-agent-surface-sunken p-4 font-mono text-agent-text text-xs leading-6">
                {section.content}
              </div>
            </section>
          );
        }

        return (
          <section key={section.title} className="space-y-2">
            <h3 className="font-semibold text-lg text-agent-text-bright">{section.title}</h3>
            <Prose>{section.content}</Prose>
          </section>
        );
      })}
    </section>
  );
}
