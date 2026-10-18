import type { CustomRenderer, CustomRendererProps } from "streamdown";
import { CARD_FENCE_LANGUAGE } from "./constants";
import { parseCard } from "./parse-card";
import { ResponseCard } from "./ResponseCard";

function CardFence({ code, isIncomplete }: CustomRendererProps) {
  const card = isIncomplete ? null : parseCard(code);
  if (!card) {
    return (
      <div className="my-2 text-agent-text text-sm leading-relaxed whitespace-pre-wrap">
        {code}
      </div>
    );
  }
  return <ResponseCard card={card} />;
}

export const RESPONSE_CARD_RENDERERS: CustomRenderer[] = [
  { component: CardFence, language: CARD_FENCE_LANGUAGE },
];
