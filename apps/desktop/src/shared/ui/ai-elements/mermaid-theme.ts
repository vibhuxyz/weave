import type { ComponentProps } from "react";
import type { Streamdown } from "streamdown";

type MermaidOptions = NonNullable<ComponentProps<typeof Streamdown>["mermaid"]>;

const TOKEN_FALLBACKS: Readonly<Record<string, string>> = {
  "--agent-low-bg": "#121d2a",
  "--agent-low-fg": "#8fc0ff",
  "--agent-text-bright": "#eceef2",
  "--agent-text-muted": "#a6abb5",
  "--agent-border-strong": "rgba(255, 255, 255, 0.14)",
  "--agent-surface-inset": "#161a21",
  "--agent-code-border": "#232833",
};

const NODE_SPACING = 44;
const RANK_SPACING = 52;
const DIAGRAM_PADDING = 16;

function readToken(styles: CSSStyleDeclaration | null, name: string): string {
  const value = styles?.getPropertyValue(name).trim();
  return value || TOKEN_FALLBACKS[name] || "inherit";
}

function buildOptions(): MermaidOptions {
  const styles = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const nodeBg = readToken(styles, "--agent-low-bg");
  const nodeFg = readToken(styles, "--agent-low-fg");
  const line = readToken(styles, "--agent-border-strong");
  const clusterBg = readToken(styles, "--agent-surface-inset");
  const clusterBorder = readToken(styles, "--agent-code-border");
  const label = readToken(styles, "--agent-text-bright");
  const muted = readToken(styles, "--agent-text-muted");

  return {
    config: {
      theme: "base",
      fontFamily: readToken(styles, "--font-sans"),
      flowchart: {
        curve: "basis",
        padding: DIAGRAM_PADDING,
        nodeSpacing: NODE_SPACING,
        rankSpacing: RANK_SPACING,
        useMaxWidth: true,
        htmlLabels: true,
      },
      themeVariables: {
        primaryColor: nodeBg,
        primaryTextColor: nodeFg,
        primaryBorderColor: nodeBg,
        secondaryColor: clusterBg,
        secondaryTextColor: label,
        secondaryBorderColor: clusterBorder,
        tertiaryColor: clusterBg,
        tertiaryTextColor: label,
        tertiaryBorderColor: clusterBorder,
        lineColor: line,
        textColor: label,
        mainBkg: nodeBg,
        nodeBorder: nodeBg,
        nodeTextColor: nodeFg,
        clusterBkg: clusterBg,
        clusterBorder: clusterBorder,
        edgeLabelBackground: clusterBg,
        titleColor: label,
        labelTextColor: muted,
        background: "transparent",
      },
    },
  };
}

let cached: MermaidOptions | null = null;

export function weaveMermaidOptions(): MermaidOptions {
  cached ??= buildOptions();
  return cached;
}
