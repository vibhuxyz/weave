import { ArrowUpRightIcon } from "lucide-react";
import { Badge } from "../../badge";
import { MessageResponse } from "../message";
import type { ResponseCardData } from "./types";

export function ResponseCard({ card }: { readonly card: ResponseCardData }) {
  return (
    <section className="border-agent-border-subtle border-t py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="font-semibold text-[15px] text-agent-text-bright">
          <span className="text-agent-text-faint">{card.index}.</span> {card.title}
        </h3>
        {card.badge && (
          <Badge variant="agent" className="shrink-0">
            {card.badge}
          </Badge>
        )}
      </div>

      {card.body && (
        <div className="mt-1.5 text-agent-text text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2">
          <MessageResponse>{card.body}</MessageResponse>
        </div>
      )}

      {card.caveat && (
        <div className="mt-1.5 text-agent-text-faint text-[13px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5">
          <MessageResponse>{card.caveat}</MessageResponse>
        </div>
      )}

      {card.link && (
        <a
          href={card.link.href}
          className="mt-2.5 inline-flex items-center gap-1 text-agent-link-fg text-sm underline underline-offset-4"
        >
          {card.link.label}
          <ArrowUpRightIcon className="size-3.5 shrink-0" />
        </a>
      )}
    </section>
  );
}
