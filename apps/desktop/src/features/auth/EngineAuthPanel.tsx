import { useEffect, useRef, useState, useCallback, useId } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import type { EngineAuthMethod, EngineAuthOperation } from "@weave/protocol";
import { LinkifiedText } from "@/shared/ui/LinkifiedText";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/cn";
import {
  ClaudeIcon,
  CodexIcon,
  GoogleGeminiIcon,
  AmpIcon,
  OpenAIIcon,
  CopilotIcon,
  CursorIcon,
  getProviderIcon,
} from "@/shared/ui/icons/ProviderIcons";

function stripAnsi(text: string): string {
  return text
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1B\([a-zA-Z]/g, "")
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, "");
}

const DEVICE_CODE_HYPHENATED = /\b[A-Z0-9]{3,8}(?:-[A-Z0-9]{3,8}){1,3}\b/i;
const DEVICE_CODE_EXPLICIT = /(?:code[:\s]+)([A-Z0-9]{6,12})\b/i;
const URL_IN_LINE = /https?:\/\/[^\s"'<>)]+/;
const CODE_CONTEXT = /\b(auth|authoriz|code|copy|device|enter|login|sign|verif|paste)\b/i;

function findDeviceCode(lines: string[]): string | null {
  const cleanLines = lines.map(stripAnsi);
  if (!cleanLines.some((line) => CODE_CONTEXT.test(line))) return null;
  for (const line of cleanLines) {
    const hyphenMatch = line.match(DEVICE_CODE_HYPHENATED);
    if (hyphenMatch?.[0]) return hyphenMatch[0].toUpperCase();
    const explicitMatch = line.match(DEVICE_CODE_EXPLICIT);
    if (explicitMatch?.[1]) return explicitMatch[1].toUpperCase();
  }
  return null;
}

function findUrl(lines: string[]): string | null {
  // First pass: look for public verification URLs (e.g. auth.openai.com, claude.ai)
  for (const rawLine of lines) {
    const line = stripAnsi(rawLine);
    const match = line.match(URL_IN_LINE);
    if (match?.[0]) {
      const url = match[0].replace(/[.,;:)>\]]+$/, "");
      if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
        return url;
      }
    }
  }
  // Fallback pass if no non-localhost URL is present
  for (const rawLine of lines) {
    const line = stripAnsi(rawLine);
    const match = line.match(URL_IN_LINE);
    if (match?.[0]) return match[0].replace(/[.,;:)>\]]+$/, "");
  }
  return null;
}

export interface AgentVisualProfile {
  id: string;
  name: string;
  provider: string;
  tagline: string;
  renderIcon: (className?: string) => React.ReactNode;
  gradientAccent: string;
  glowShadow: string;
  cardBorder: string;
  cardBg: string;
  badgeClass: string;
  avatarBg: string;
  avatarBorder: string;
  accentText: string;
  primaryButtonClass: string;
  secondaryBorderHover: string;
  ringColor: string;
  apiKeyPlaceholder: string;
  apiKeyDocsUrl?: string;
  apiKeyDocsLabel?: string;
}

const CLAUDE_PROFILE: AgentVisualProfile = {
  id: "claude-code",
  name: "Claude Code",
  provider: "Anthropic",
  tagline: "Anthropic agentic coding CLI",
  renderIcon: (className = "size-6") => <ClaudeIcon className={className} />,
  gradientAccent: "from-[#D97757] via-[#F59E0B] to-[#EA580C]",
  glowShadow: "shadow-[0_12px_40px_-10px_rgba(217,119,87,0.22)]",
  cardBorder: "border-[#D97757]/35 dark:border-[#D97757]/45",
  cardBg: "bg-gradient-to-br from-[#D97757]/[0.06] via-card to-background",
  badgeClass: "bg-[#D97757]/10 text-[#D97757] dark:text-[#F59E0B] border-[#D97757]/20",
  avatarBg: "bg-[#D97757]/15 border-[#D97757]/30",
  avatarBorder: "border-[#D97757]/40",
  accentText: "text-[#D97757] dark:text-[#F59E0B]",
  primaryButtonClass: "bg-[#D97757] hover:bg-[#C26243] text-white shadow-sm shadow-[#D97757]/25",
  secondaryBorderHover: "hover:border-[#D97757]/50 hover:bg-[#D97757]/5",
  ringColor: "focus-visible:ring-[#D97757]/40",
  apiKeyPlaceholder: "sk-ant-api03-...",
  apiKeyDocsUrl: "https://console.anthropic.com/settings/keys",
  apiKeyDocsLabel: "Get Anthropic API Key",
};

const CODEX_PROFILE: AgentVisualProfile = {
  id: "codex",
  name: "Codex",
  provider: "OpenAI",
  tagline: "OpenAI agentic developer assistant",
  renderIcon: (className = "size-6") => <CodexIcon className={className} />,
  gradientAccent: "from-[#10A37F] via-[#34D399] to-[#059669]",
  glowShadow: "shadow-[0_12px_40px_-10px_rgba(16,163,127,0.22)]",
  cardBorder: "border-[#10A37F]/35 dark:border-[#10A37F]/45",
  cardBg: "bg-gradient-to-br from-[#10A37F]/[0.06] via-card to-background",
  badgeClass: "bg-[#10A37F]/10 text-[#10A37F] dark:text-[#34D399] border-[#10A37F]/20",
  avatarBg: "bg-[#10A37F]/15 border-[#10A37F]/30",
  avatarBorder: "border-[#10A37F]/40",
  accentText: "text-[#10A37F] dark:text-[#34D399]",
  primaryButtonClass: "bg-[#10A37F] hover:bg-[#0D8769] text-white shadow-sm shadow-[#10A37F]/25",
  secondaryBorderHover: "hover:border-[#10A37F]/50 hover:bg-[#10A37F]/5",
  ringColor: "focus-visible:ring-[#10A37F]/40",
  apiKeyPlaceholder: "sk-proj-...",
  apiKeyDocsUrl: "https://platform.openai.com/api-keys",
  apiKeyDocsLabel: "Get OpenAI API Key",
};

const ANTIGRAVITY_PROFILE: AgentVisualProfile = {
  id: "antigravity",
  name: "Google Antigravity",
  provider: "Google DeepMind",
  tagline: "Google next-gen agentic coding platform",
  renderIcon: (className = "size-6") => <GoogleGeminiIcon className={className} />,
  gradientAccent: "from-[#3186FF] via-[#7A9DFF] to-[#9333EA]",
  glowShadow: "shadow-[0_12px_40px_-10px_rgba(49,134,255,0.22)]",
  cardBorder: "border-blue-500/35 dark:border-blue-500/45",
  cardBg: "bg-gradient-to-br from-blue-500/[0.06] via-card to-background",
  badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  avatarBg: "bg-blue-500/15 border-blue-500/30",
  avatarBorder: "border-blue-500/40",
  accentText: "text-blue-600 dark:text-blue-400",
  primaryButtonClass: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/25",
  secondaryBorderHover: "hover:border-blue-500/50 hover:bg-blue-500/5",
  ringColor: "focus-visible:ring-blue-500/40",
  apiKeyPlaceholder: "AIzaSy...",
  apiKeyDocsUrl: "https://aistudio.google.com/app/apikey",
  apiKeyDocsLabel: "Get Gemini API Key",
};

const AMP_PROFILE: AgentVisualProfile = {
  id: "amp",
  name: "Amp",
  provider: "Sourcegraph",
  tagline: "Sourcegraph codebase reasoning agent",
  renderIcon: (className = "size-6") => <AmpIcon className={className} />,
  gradientAccent: "from-[#F34E3F] via-[#FB7185] to-[#E11D48]",
  glowShadow: "shadow-[0_12px_40px_-10px_rgba(243,78,63,0.22)]",
  cardBorder: "border-[#F34E3F]/35 dark:border-[#F34E3F]/45",
  cardBg: "bg-gradient-to-br from-[#F34E3F]/[0.06] via-card to-background",
  badgeClass: "bg-[#F34E3F]/10 text-[#F34E3F] dark:text-[#FB7185] border-[#F34E3F]/20",
  avatarBg: "bg-[#F34E3F]/15 border-[#F34E3F]/30",
  avatarBorder: "border-[#F34E3F]/40",
  accentText: "text-[#F34E3F] dark:text-[#FB7185]",
  primaryButtonClass: "bg-[#F34E3F] hover:bg-[#D93D30] text-white shadow-sm shadow-[#F34E3F]/25",
  secondaryBorderHover: "hover:border-[#F34E3F]/50 hover:bg-[#F34E3F]/5",
  ringColor: "focus-visible:ring-[#F34E3F]/40",
  apiKeyPlaceholder: "sgp_...",
  apiKeyDocsUrl: "https://sourcegraph.com/user/settings/tokens",
  apiKeyDocsLabel: "Get Sourcegraph Token",
};

function resolveAgentProfile(
  engineId?: string | null,
  engineLabel?: string | null,
): AgentVisualProfile {
  const normId = (engineId || "").toLowerCase();
  const normLabel = (engineLabel || "").toLowerCase();

  if (normId.includes("claude") || normLabel.includes("claude")) {
    return CLAUDE_PROFILE;
  }
  if (
    normId.includes("codex") ||
    normLabel.includes("codex") ||
    normLabel.includes("openai") ||
    normLabel.includes("chatgpt")
  ) {
    return CODEX_PROFILE;
  }
  if (
    normId.includes("antigravity") ||
    normId === "agy" ||
    normLabel.includes("antigravity") ||
    normLabel.includes("gemini") ||
    normLabel.includes("google")
  ) {
    return ANTIGRAVITY_PROFILE;
  }
  if (
    normId.includes("amp") ||
    normLabel.includes("amp") ||
    normLabel.includes("sourcegraph")
  ) {
    return AMP_PROFILE;
  }

  // Generic fallback
  return {
    id: engineId || "custom",
    name: engineLabel || "Agent",
    provider: "AI Engine",
    tagline: "Autonomous coding agent",
    renderIcon: (className = "size-6") =>
      getProviderIcon(engineId || engineLabel || "custom", className) ?? (
        <Terminal className={cn(className, "text-primary")} />
      ),
    gradientAccent: "from-primary/80 via-primary to-primary/60",
    glowShadow: "shadow-[0_12px_40px_-10px_rgba(0,0,0,0.18)]",
    cardBorder: "border-border/80",
    cardBg: "bg-card",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    avatarBg: "bg-primary/10 border-primary/20",
    avatarBorder: "border-primary/30",
    accentText: "text-primary",
    primaryButtonClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
    secondaryBorderHover: "hover:border-primary/50 hover:bg-primary/5",
    ringColor: "focus-visible:ring-primary/40",
    apiKeyPlaceholder: "sk-...",
  };
}

interface MethodDisplayMeta {
  title: string;
  description: string;
  badge?: string;
  isRecommended?: boolean;
  isApiKey?: boolean;
  icon: React.ReactNode;
  actionText: string;
}

function resolveMethodMeta(
  method: EngineAuthMethod,
  agent: AgentVisualProfile,
  message: string,
): MethodDisplayMeta {
  const id = method.id.toLowerCase();
  const name = method.name.toLowerCase();

  const isTermsAuth =
    method.id === "agy-login" ||
    id.includes("login") ||
    message.includes("antigravity.google/terms");

  const isApiKey =
    id.includes("api-key") ||
    id === "api-key" ||
    name.includes("api key") ||
    name.includes("token");

  if (isApiKey) {
    return {
      title: method.name || `${agent.name} API Key`,
      description:
        method.description ||
        `Authenticate directly with your secret ${agent.provider} API key`,
      badge: "API Key",
      isApiKey: true,
      icon: <KeyRound className="size-4 text-amber-500" />,
      actionText: "Enter Key",
    };
  }

  if (id === "claude-ai-login" || name.includes("subscription")) {
    return {
      title: method.name || "Claude Subscription",
      description:
        method.description ||
        "Authenticate with your Claude Pro, Max, or Team subscription",
      badge: "Pro / Team",
      isRecommended: true,
      icon: <Sparkles className={cn("size-4", agent.accentText)} />,
      actionText: "Sign In",
    };
  }

  if (id === "console-login" || name.includes("console")) {
    return {
      title: method.name || "Anthropic Console",
      description:
        method.description ||
        "Use Anthropic Console with API usage billing credits",
      badge: "Pay as you go",
      icon: <Terminal className="size-4 text-muted-foreground" />,
      actionText: "Connect",
    };
  }

  if (
    id === "chat-gpt-device-code" ||
    id.includes("device") ||
    name.includes("device")
  ) {
    return {
      title: method.name || "Sign in with Device Code",
      description:
        method.description ||
        "Sign in using one-time verification code in browser",
      badge: "Recommended",
      isRecommended: true,
      icon: <Smartphone className={cn("size-4", agent.accentText)} />,
      actionText: "Get Code",
    };
  }

  if (id === "chat-gpt" || name.includes("browser")) {
    return {
      title: method.name || "Sign in with Browser",
      description:
        method.description ||
        "Authenticate directly using your OpenAI ChatGPT account",
      badge: "Browser",
      icon: <Globe className="size-4 text-emerald-500" />,
      actionText: "Authorize",
    };
  }

  if (isTermsAuth) {
    return {
      title: method.name || `Sign in with ${agent.name}`,
      description:
        method.description ||
        `Runs ${agent.id === "antigravity" ? "agy auth login" : "CLI auth"} to authenticate`,
      badge: "Google Auth",
      isRecommended: true,
      icon: agent.renderIcon("size-4"),
      actionText: message.includes("terms") ? "Agree & Sign In" : "Sign In",
    };
  }

  return {
    title: method.name,
    description: method.description || "Authenticate with this method",
    icon: <ArrowRight className="size-4 text-muted-foreground" />,
    actionText: "Continue",
  };
}

export interface EngineAuthPanelProps {
  engineId?: string;
  engineLabel: string;
  message: string;
  methods: EngineAuthMethod[];
  operation: EngineAuthOperation | null;
  onStart: (methodId: string, secret?: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
}

export function EngineAuthPanel({
  engineId,
  engineLabel,
  message,
  methods,
  operation,
  onStart,
  onCancel,
  onDismiss,
}: EngineAuthPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastOpenedUrlRef = useRef<string | null>(null);

  const [enteringApiKeyMethodId, setEnteringApiKeyMethodId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedItem, setCopiedItem] = useState<"code" | "url" | "logs" | "both" | null>(null);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [lastTriedMethodId, setLastTriedMethodId] = useState<string | null>(null);

  const agent = resolveAgentProfile(engineId, engineLabel);
  const output = operation?.output ?? [];
  const running = operation?.status === "running";
  const deviceCode = findDeviceCode(output);
  const url = findUrl(output);

  // Auto-open detected URL in browser once when running
  useEffect(() => {
    if (running && url && lastOpenedUrlRef.current !== url) {
      lastOpenedUrlRef.current = url;
      void openUrl(url).catch((err) =>
        console.error("[EngineAuthPanel] Failed to auto-open URL:", err),
      );
    }
  }, [running, url]);

  useEffect(() => {
    if (!running) {
      lastOpenedUrlRef.current = null;
      setEnteringApiKeyMethodId(null);
    }
  }, [running]);

  // Expand terminal automatically if an error occurs so user can debug immediately
  useEffect(() => {
    if (operation?.error || (operation?.status === "failed" && !running)) {
      setTerminalExpanded(true);
    }
  }, [operation?.error, operation?.status, running]);

  // Follow the tail of terminal logs
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [output.length]);

  const effectiveMethods =
    methods.length > 0
      ? methods
      : engineId === "antigravity" || engineId === "agy"
      ? [
          {
            id: "agy-login",
            name: "Sign in with Google Antigravity",
            kind: "terminal" as const,
            description: "Runs `agy auth login` to authenticate",
          },
        ]
      : engineId === "claude-code"
      ? [
          {
            id: "claude-ai-login",
            name: "Claude Subscription",
            kind: "terminal" as const,
            description: "Use Claude subscription",
          },
          {
            id: "console-login",
            name: "Anthropic Console",
            kind: "terminal" as const,
            description: "Use Anthropic Console (API usage billing)",
          },
        ]
      : engineId === "codex"
      ? [
          {
            id: "chat-gpt-device-code",
            name: "Sign in with Device Code",
            kind: "terminal" as const,
            description: "Sign in using one-time verification code in browser",
          },
          {
            id: "chat-gpt",
            name: "Sign in with Browser",
            kind: "terminal" as const,
            description: "Authenticate directly using your OpenAI ChatGPT account",
          },
          {
            id: "api-key",
            name: "OpenAI API Key",
            kind: "terminal" as const,
            description: "Authenticate using an OpenAI API Key",
          },
        ]
      : [
          {
            id: "agy-login",
            name: `Sign in with ${agent.name}`,
            kind: "terminal" as const,
            description: `Authenticate with ${agent.name}`,
          },
        ];

  const actionable = effectiveMethods.filter((method) => method.kind !== "env_var");
  const envVarOnly = effectiveMethods.length > 0 && actionable.length === 0;

  const handleCopyCode = async () => {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode);
      setCopiedItem("code");
      toast.success(`Device code copied: ${deviceCode}`);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error("[EngineAuthPanel] Failed to copy code:", err);
    }
  };

  const handleCopyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedItem("url");
      toast.success("Verification link copied to clipboard!");
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error("[EngineAuthPanel] Failed to copy URL:", err);
    }
  };

  const handleOpenUrl = async () => {
    if (!url) return;
    try {
      await openUrl(url);
    } catch (err) {
      console.error("[EngineAuthPanel] openUrl failed:", err);
    }
  };

  const handleCopyCodeAndOpenBrowser = async () => {
    if (!deviceCode || !url) return;
    try {
      await navigator.clipboard.writeText(deviceCode);
      setCopiedItem("both");
      toast.success(`Copied code "${deviceCode}"! Opening browser...`);
      await openUrl(url);
      setTimeout(() => setCopiedItem(null), 2500);
    } catch (err) {
      console.error("[EngineAuthPanel] Failed copy & open:", err);
      void openUrl(url);
    }
  };

  const handleCopyLogs = async () => {
    if (output.length === 0) return;
    try {
      const clean = output.map(stripAnsi).join("\n");
      await navigator.clipboard.writeText(clean);
      setCopiedItem("logs");
      toast.success("Process logs copied to clipboard!");
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error("[EngineAuthPanel] Failed to copy logs:", err);
    }
  };

  const handlePasteApiKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKey(text.trim());
        toast.success("Pasted API key from clipboard");
      }
    } catch (err) {
      console.warn("[EngineAuthPanel] Clipboard readText unavailable:", err);
    }
  };

  const isAntigravityTerms =
    message.includes("antigravity.google/terms") ||
    agent.id === "antigravity";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/95 backdrop-blur-xl transition-all duration-300",
        agent.cardBorder,
        agent.glowShadow,
        "shadow-lg shadow-black/5 dark:shadow-black/20",
      )}
    >
      {/* Ambient decorative glow behind the avatar */}
      <div
        className={cn(
          "pointer-events-none absolute -top-16 -left-16 size-48 rounded-full blur-3xl opacity-20 dark:opacity-30 transition-opacity",
          agent.id === "claude-code" && "bg-orange-500",
          agent.id === "codex" && "bg-emerald-500",
          agent.id === "antigravity" && "bg-blue-500",
          agent.id === "amp" && "bg-rose-500",
          agent.id === "custom" && "bg-primary",
        )}
      />

      {/* Top signature gradient bar corresponding to the agent */}
      <div className={cn("h-1 w-full bg-gradient-to-r", agent.gradientAccent)} />

      <div className="relative z-10 flex flex-col gap-4 p-4 sm:p-5">
        {/* Header: Avatar, Agent Details, Status Pill, and Dismiss Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Agent Avatar Container with active pulsing indicator */}
            <div className="relative group shrink-0">
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl border p-2.5 transition-transform duration-200 group-hover:scale-105",
                  agent.avatarBg,
                  agent.avatarBorder,
                )}
              >
                {agent.renderIcon("size-6 shrink-0")}
              </div>
              {running && (
                <span className="absolute -top-1 -right-1 flex size-3">
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                      agent.id === "codex"
                        ? "bg-emerald-400"
                        : agent.id === "claude-code"
                        ? "bg-amber-400"
                        : agent.id === "amp"
                        ? "bg-rose-400"
                        : "bg-blue-400",
                    )}
                  />
                  <span
                    className={cn(
                      "relative inline-flex size-3 rounded-full",
                      agent.id === "codex"
                        ? "bg-emerald-500"
                        : agent.id === "claude-code"
                        ? "bg-amber-500"
                        : agent.id === "amp"
                        ? "bg-rose-500"
                        : "bg-blue-500",
                    )}
                  />
                </span>
              )}
            </div>

            {/* Titles & Status Badges */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-base tracking-tight text-foreground">
                  {agent.name}
                </span>

                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium border",
                    agent.badgeClass,
                  )}
                >
                  {agent.provider}
                </span>

                {running ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
                    {operation?.phase === "verifying"
                      ? "Verifying Session…"
                      : "Awaiting Authorization…"}
                  </span>
                ) : operation?.error ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive border border-destructive/20">
                    <AlertCircle className="size-3" />
                    Sign-in Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/60">
                    <Lock className="size-3" />
                    Authentication Required
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                <LinkifiedText text={message} />
              </div>
            </div>
          </div>

          {/* Dismiss Action */}
          {!running && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-muted/80 transition-colors"
              title="Dismiss sign-in panel"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Google Terms of Service Card */}
        {isAntigravityTerms && (
          <div className="flex items-center gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-3.5 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-blue-500" />
            <span className="leading-normal">
              By connecting to Google Antigravity, you agree to the{" "}
              <a
                href="https://antigravity.google/terms"
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://antigravity.google/terms").catch(console.error);
                }}
                className="font-medium text-blue-600 dark:text-blue-400 underline hover:opacity-80 inline-flex items-center gap-0.5 cursor-pointer"
              >
                Google Antigravity Terms of Service
                <ExternalLink className="size-3 inline" />
              </a>
              .
            </span>
          </div>
        )}

        {/* Environment Variable notice */}
        {envVarOnly && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {agent.name} requires environment variables for authentication.
            </p>
            <p className="mt-1">
              Configure your API keys or credentials in your environment, then reopen Weave.
            </p>
          </div>
        )}

        {/* Interactive Device Code & Verification URL (Live running state) */}
        {running && (deviceCode || url) && (
          <div className="rounded-xl border border-border/80 bg-background/80 p-3.5 shadow-sm space-y-3">
            {deviceCode && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/40">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <Smartphone className="size-3.5" />
                    <span>One-Time Device Code</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-xl sm:text-2xl font-bold tracking-widest text-foreground select-all">
                      {deviceCode}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5 border-border/80 hover:bg-background"
                  onClick={handleCopyCode}
                >
                  {copiedItem === "code" ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Copied!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {url && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <Globe className="size-3.5" />
                    <span>Verification Link</span>
                  </div>
                  <a
                    href={url}
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenUrl();
                    }}
                    className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                    title={url}
                  >
                    {url}
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border/80 hover:bg-background"
                    onClick={handleCopyUrl}
                  >
                    {copiedItem === "url" ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span>{copiedItem === "url" ? "Copied" : "Copy Link"}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border/80 hover:bg-background"
                    onClick={handleOpenUrl}
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Open in Browser</span>
                  </Button>
                </div>
              </div>
            )}

            {/* HERO COMBINED BUTTON if both code and URL exist */}
            {deviceCode && url && (
              <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  size="default"
                  onClick={handleCopyCodeAndOpenBrowser}
                  className={cn("flex-1 gap-2 font-medium", agent.primaryButtonClass)}
                >
                  {copiedItem === "both" ? (
                    <>
                      <Check className="size-4" />
                      <span>Code Copied! Browser Opened</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Copy Code & Open Browser</span>
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onCancel}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Running status banner when no code/url is present yet */}
        {running && !deviceCode && !url && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/80 bg-background/60">
            <div className="flex items-center gap-2.5">
              <Spinner className={cn("size-4", agent.accentText)} />
              <span className="text-xs font-medium text-foreground">
                {operation?.phase === "verifying"
                  ? "Verifying authentication credentials with engine…"
                  : "Waiting for you to complete sign-in in your browser…"}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Error notification card with Retry affordance */}
        {(operation?.error || (operation?.status === "failed" && !running)) && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
              <div className="min-w-0">
                <p className="font-semibold">Authentication Failed</p>
                <p className="mt-0.5 whitespace-pre-wrap text-destructive/90">
                  {operation?.error ||
                    "The sign-in process exited with an error. Please try again or switch methods."}
                </p>
              </div>
            </div>
            {lastTriedMethodId && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onStart(lastTriedMethodId)}
                className="shrink-0 gap-1 bg-background text-destructive border-destructive/40 hover:bg-destructive/10"
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            )}
          </div>
        )}

        {/* API Key Input Drawer */}
        {enteringApiKeyMethodId ? (
          <div className="rounded-xl border border-border/80 bg-background/80 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className={cn("size-4", agent.accentText)} />
                <span className="font-semibold text-xs text-foreground">
                  Enter {agent.name} API Key
                </span>
              </div>
              {agent.apiKeyDocsUrl && (
                <a
                  href={agent.apiKeyDocsUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    void openUrl(agent.apiKeyDocsUrl!);
                  }}
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  {agent.apiKeyDocsLabel ?? "Get API Key"}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder={agent.apiKeyPlaceholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && apiKey.trim()) {
                      e.preventDefault();
                      setLastTriedMethodId(enteringApiKeyMethodId);
                      onStart(enteringApiKeyMethodId, apiKey.trim());
                      setEnteringApiKeyMethodId(null);
                      setApiKey("");
                    } else if (e.key === "Escape") {
                      setEnteringApiKeyMethodId(null);
                      setApiKey("");
                    }
                  }}
                  className={cn("h-9 pl-3 pr-20 text-xs font-mono", agent.ringColor)}
                  autoFocus
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {apiKey && (
                    <button
                      type="button"
                      onClick={() => setApiKey("")}
                      className="p-1 text-muted-foreground hover:text-foreground rounded"
                      title="Clear"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                    title={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteApiKey}
                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                    title="Paste from clipboard"
                  >
                    <Clipboard className="size-3.5" />
                  </button>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={!apiKey.trim()}
                onClick={() => {
                  if (apiKey.trim()) {
                    setLastTriedMethodId(enteringApiKeyMethodId);
                    onStart(enteringApiKeyMethodId, apiKey.trim());
                    setEnteringApiKeyMethodId(null);
                    setApiKey("");
                  }
                }}
                className={cn("h-9 px-4 font-medium", agent.primaryButtonClass)}
              >
                Connect
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 px-3 text-xs"
                onClick={() => {
                  setEnteringApiKeyMethodId(null);
                  setApiKey("");
                }}
              >
                Cancel
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Your key is saved securely on this machine and used for future {agent.name} sessions.
            </p>
          </div>
        ) : !running ? (
          /* Interactive Method Selection Cards */
          actionable.length > 1 ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {actionable.map((method) => {
                const meta = resolveMethodMeta(method, agent, message);
                return (
                  <div
                    key={method.id}
                    onClick={() => {
                      if (meta.isApiKey) {
                        setEnteringApiKeyMethodId(method.id);
                      } else {
                        setLastTriedMethodId(method.id);
                        onStart(method.id);
                      }
                    }}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-border/80 bg-background/60 p-3.5 transition-all duration-200 cursor-pointer",
                      "hover:bg-accent/40 hover:shadow-sm",
                      agent.secondaryBorderHover,
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 transition-colors group-hover:bg-background",
                          meta.isRecommended && agent.avatarBg,
                        )}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                            {meta.title}
                          </span>
                          {meta.badge && (
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.2 text-[10px] font-medium border",
                                meta.isRecommended
                                  ? agent.badgeClass
                                  : "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {meta.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end">
                      <Button
                        type="button"
                        size="xs"
                        variant={meta.isRecommended ? "primary" : "outline"}
                        className={cn(
                          "pointer-events-none text-xs gap-1",
                          meta.isRecommended && agent.primaryButtonClass,
                        )}
                      >
                        {meta.actionText}
                        <ArrowRight className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : actionable.length === 1 ? (
            /* Single prominent action button (e.g. Antigravity) */
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="default"
                onClick={() => {
                  setLastTriedMethodId(actionable[0].id);
                  onStart(actionable[0].id);
                }}
                className={cn("gap-2 font-medium px-5", agent.primaryButtonClass)}
              >
                {actionable[0].id === "agy-login" ? (
                  <GoogleGeminiIcon className="size-4" />
                ) : (
                  agent.renderIcon("size-4")
                )}
                {message.includes("terms")
                  ? `Agree & Sign In with ${agent.name}`
                  : `Sign in with ${agent.name}`}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          ) : null
        ) : null}

        {/* Collapsible Terminal Output Stream */}
        {output.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 border-b border-zinc-800/80 select-none">
              <div className="flex items-center gap-2">
                {/* Mac Traffic Light dots */}
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#FF5F56]/90 border border-[#E0443E]" />
                  <span className="size-2.5 rounded-full bg-[#FFBD2E]/90 border border-[#DEA123]" />
                  <span className="size-2.5 rounded-full bg-[#27C93F]/90 border border-[#1AAB29]" />
                </div>
                <span className="ml-2 text-[11px] font-mono font-medium text-zinc-400">
                  Authentication Stream
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] font-mono text-zinc-400">
                  {output.length} lines
                </span>
                {running && (
                  <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Copy logs to clipboard"
                >
                  {copiedItem === "logs" ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalExpanded((v) => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title={terminalExpanded ? "Collapse logs" : "Expand logs"}
                >
                  {terminalExpanded ? (
                    <>
                      <ChevronUp className="size-3" />
                      <span>Collapse</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3" />
                      <span>Expand</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className={cn(
                "overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300 transition-all duration-200",
                terminalExpanded ? "max-h-60" : "max-h-24",
              )}
            >
              {output.map((rawLine, index) => {
                const line = stripAnsi(rawLine);
                return (
                  <div key={index} className="hover:bg-zinc-900/40 px-1 rounded">
                    <LinkifiedText text={line || " "} className="text-zinc-300" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
