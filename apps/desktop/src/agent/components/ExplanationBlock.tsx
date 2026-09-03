import { Badge } from "@/shared/ui/badge";
import type { ExplanationBlock as ExplanationBlockModel } from "../normalize/types";
import { CodeBlockView } from "./CodeBlockView";

export function ExplanationBlock({
  block,
}: {
  block: ExplanationBlockModel;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <p className="font-mono text-[#f0845d] text-[11px] uppercase tracking-[0.08em]">
          In one line
        </p>
        <p className="text-base font-semibold leading-7 text-white">{block.oneLine}</p>
        <div className="flex flex-wrap gap-2">
          {block.sections.map((section) => (
            <Badge
              key={`${section.type}-${section.title}`}
              variant="secondary"
              className="border-[#3b3032] bg-[#211b22] text-[#cfc7d6]"
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
              <h3 className="font-semibold text-lg text-white">{section.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border border-[#3a2d34] bg-[#181820] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <p className="font-mono text-[#f0845d] text-xs">{item.name}</p>
                    <p className="mt-4 font-semibold text-3xl text-white">{item.value}</p>
                    {item.description && (
                      <p className="mt-2 text-muted-foreground text-xs">
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
              <h3 className="font-semibold text-lg text-white">{section.title}</h3>
              <CodeBlockView
                block={{
                  id: `${block.id}-${section.title}`,
                  schemaVersion: 1,
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
              <h3 className="font-semibold text-lg text-white">{section.title}</h3>
              <div className="rounded-lg border border-[#3a2d34] bg-[#101015] p-4 font-mono text-[#d7d1dc] text-xs leading-6">
                {section.content}
              </div>
            </section>
          );
        }

        return (
          <section key={section.title} className="space-y-2">
            <h3 className="font-semibold text-lg text-white">{section.title}</h3>
            <p className="text-sm leading-7 text-[#d7d1dc]">{section.content}</p>
          </section>
        );
      })}
    </section>
  );
}
