import { cn } from "@/shared/lib/cn";

/**
 * A small looping SVG mark for a plugin, chosen by its marketplace category.
 * ~290 plugins share ~12 categories, so the art is per-category, not
 * per-plugin. Every glyph animates subtly and forever (no hover needed).
 */

type GlyphKind =
  | "development"
  | "database"
  | "monitoring"
  | "security"
  | "deployment"
  | "design"
  | "productivity"
  | "automation"
  | "learning"
  | "testing"
  | "location"
  | "default";

const CATEGORY_TO_KIND: Record<string, GlyphKind> = {
  development: "development",
  database: "database",
  monitoring: "monitoring",
  security: "security",
  deployment: "deployment",
  migration: "deployment",
  design: "design",
  productivity: "productivity",
  automation: "automation",
  learning: "learning",
  testing: "testing",
  location: "location",
  math: "default",
};

const KIND_TINT: Record<GlyphKind, string> = {
  development: "text-sky-400",
  database: "text-emerald-400",
  monitoring: "text-rose-400",
  security: "text-amber-400",
  deployment: "text-violet-400",
  design: "text-pink-400",
  productivity: "text-teal-400",
  automation: "text-orange-400",
  learning: "text-indigo-400",
  testing: "text-lime-400",
  location: "text-cyan-400",
  default: "text-muted-foreground",
};

export function pluginGlyphKind(category: string | undefined): GlyphKind {
  return (category && CATEGORY_TO_KIND[category]) || "default";
}

export function PluginGlyph({
  category,
  className,
  variant = "chip",
}: {
  category: string | undefined;
  className?: string;
  /** "chip" = boxed mini icon; "hero" = large glowing mark, no box. */
  variant?: "chip" | "hero";
}) {
  const kind = pluginGlyphKind(category);
  if (variant === "hero") {
    return (
      <span
        className={cn(
          "relative flex items-center justify-center",
          KIND_TINT[kind],
          className,
        )}
      >
        {/* soft glow behind the mark */}
        <span
          aria-hidden
          className="absolute inset-[18%] rounded-full bg-current opacity-[0.14] blur-2xl"
        />
        <svg
          viewBox="0 0 32 32"
          className="relative size-3/5 drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          fill="none"
          aria-hidden
        >
          <Body kind={kind} />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-xl bg-black/25 ring-1 ring-white/5",
        KIND_TINT[kind],
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-1/2" fill="none" aria-hidden>
        <Body kind={kind} />
      </svg>
    </span>
  );
}

function Body({ kind }: { kind: GlyphKind }) {
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "development":
      return (
        <>
          <path d="M11 9 L5 16 L11 23" {...stroke} />
          <path d="M21 9 L27 16 L21 23" {...stroke} />
          <rect x="15" y="13" width="2.5" height="6" rx="1" fill="currentColor" className="animate-glyph-blink" />
        </>
      );
    case "database":
      return (
        <>
          <ellipse cx="16" cy="9" rx="9" ry="3.5" {...stroke} />
          <path d="M7 9 v14 c0 1.9 4 3.5 9 3.5 s9 -1.6 9 -3.5 V9" {...stroke} />
          <ellipse cx="16" cy="16" rx="9" ry="3.5" stroke="currentColor" strokeWidth={2} className="animate-glyph-pulse" style={{ transformOrigin: "16px 16px" }} />
        </>
      );
    case "monitoring":
      return (
        <polyline
          points="3,16 11,16 14,8 18,24 21,16 29,16"
          {...stroke}
          strokeDasharray="32"
          className="animate-glyph-draw"
        />
      );
    case "security":
      return (
        <>
          <path d="M16 3 L27 8 V15 C27 22 22 27 16 29 C10 27 5 22 5 15 V8 Z" {...stroke} />
          <circle cx="16" cy="15" r="3.5" fill="currentColor" className="animate-glyph-pulse" style={{ transformOrigin: "16px 15px" }} />
        </>
      );
    case "deployment":
      return (
        <g className="animate-glyph-bob" style={{ transformOrigin: "16px 16px" }}>
          <path d="M16 4 C21 9 22 15 22 20 H10 C10 15 11 9 16 4 Z" {...stroke} />
          <circle cx="16" cy="13" r="2.5" fill="currentColor" />
          <path d="M12 22 L9 27 M20 22 L23 27" {...stroke} />
        </g>
      );
    case "design":
      return (
        <>
          <circle cx="13" cy="13" r="7" {...stroke} />
          <rect x="14" y="14" width="12" height="12" rx="2.5" {...stroke} className="animate-glyph-orbit" style={{ transformOrigin: "20px 20px" }} />
        </>
      );
    case "productivity":
      return (
        <>
          <rect x="5" y="5" width="22" height="22" rx="5" {...stroke} />
          <path d="M11 16 L15 20 L22 11" {...stroke} strokeDasharray="24" className="animate-glyph-draw" />
        </>
      );
    case "automation":
      return (
        <g className="animate-glyph-orbit" style={{ transformOrigin: "16px 16px" }}>
          <path
            d="M16 6 l2 3 h3 l-1 3 2 3 -3 1 -1 3 -3 -1 -3 1 -1 -3 -3 -1 2 -3 -1 -3 h3 z"
            {...stroke}
          />
          <circle cx="16" cy="16" r="3" {...stroke} />
        </g>
      );
    case "learning":
      return (
        <g className="animate-glyph-bob" style={{ transformOrigin: "16px 16px" }}>
          <path d="M4 10 L16 5 L28 10 L16 15 Z" {...stroke} />
          <path d="M9 12 V19 C9 21 22 21 22 19 V12" {...stroke} />
        </g>
      );
    case "testing":
      return (
        <>
          <path d="M13 4 h6 M14 4 v8 L7 25 c-1 2 0 3 2 3 h14 c2 0 3 -1 2 -3 L18 12 V4" {...stroke} />
          <circle cx="16" cy="21" r="2" fill="currentColor" className="animate-glyph-pulse" style={{ transformOrigin: "16px 21px" }} />
        </>
      );
    case "location":
      return (
        <g className="animate-glyph-bob" style={{ transformOrigin: "16px 16px" }}>
          <path d="M16 4 C11 4 7 8 7 13 C7 20 16 28 16 28 C16 28 25 20 25 13 C25 8 21 4 16 4 Z" {...stroke} />
          <circle cx="16" cy="13" r="3" fill="currentColor" />
        </g>
      );
    default:
      return (
        <g className="animate-glyph-pulse" style={{ transformOrigin: "16px 16px" }}>
          <path d="M12 4 v6 M20 4 v6" {...stroke} />
          <rect x="9" y="10" width="14" height="8" rx="2" {...stroke} />
          <path d="M16 18 v6" {...stroke} />
        </g>
      );
  }
}
