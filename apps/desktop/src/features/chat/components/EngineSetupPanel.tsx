import { useEffect, useRef, useState } from "react";
import { TerminalIcon } from "lucide-react";
import {
  PromptCard,
  PromptCardHeader,
  PromptCardBody,
  PromptCardFooter,
  PromptCardButton,
} from "./PromptCard";
import { SetupConsentCard } from "./SetupConsentCard";
import type { EngineSetupPrompt, TerminalKeyName } from "@/features/chat/hooks";

const KEY_BY_EVENT: Readonly<Record<string, TerminalKeyName>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  " ": "space",
  Tab: "tab",
  Escape: "escape",
};

/**
 * The engine's own first-run wizard, run in a PTY and shown here.
 *
 * It is shown rather than answered: the pages carry consent choices that are
 * the user's to make. Keyboard input is forwarded by name, never as raw
 * escape bytes.
 */
export function EngineSetupPanel({
  setup,
  onStart,
  onCancel,
  onKey,
  onSubmitConsent,
}: {
  setup: EngineSetupPrompt;
  onStart: (engineId: string) => void;
  onCancel: () => void;
  onKey: (key: TerminalKeyName) => void;
  onSubmitConsent: (agreed: boolean) => void;
}) {
  const screenRef = useRef<HTMLPreElement>(null);
  const [preferTerminal, setPreferTerminal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const running = setup.status === "running";
  const consent = setup.consent;
  // The card and the terminal write to the same PTY, so only one may exist.
  const showCard =
    running && !preferTerminal && (consent?.kind === "card" || consent?.kind === "applying");

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [setup.lines]);

  useEffect(() => {
    if (running) screenRef.current?.focus();
  }, [running]);

  return (
    <PromptCard role="region" aria-label={`${setup.engineLabel} setup`}>
      <PromptCardHeader
        badge="Engine setup"
        badgeVariant="warn"
        icon={<TerminalIcon className="mt-0.5 size-4 shrink-0 text-agent-warn" />}
        title={`${setup.engineLabel} needs first-run setup`}
        subtitle={setup.description}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(!isCollapsed)}
        onClose={onCancel}
        closeLabel="Cancel setup"
      />
      {!isCollapsed && (
        <>
          <PromptCardBody>
            {setup.error && (
              <span className="text-agent-critical-fg text-xs">{setup.error}</span>
            )}

            {showCard && consent.kind === "card" && (
              <SetupConsentCard
                title={consent.title}
                notice={consent.notice}
                agreement={consent.agreement}
                checked={consent.checked}
                links={consent.links}
                applying={setup.consentSubmitted}
                onFinish={onSubmitConsent}
                onUseTerminal={() => setPreferTerminal(true)}
              />
            )}

            {showCard && consent.kind === "applying" && (
              <p className="text-agent-text-faint text-xs">
                Finishing setup…
              </p>
            )}

            {consent?.kind === "manual" && running && (
              <p className="text-agent-warn text-xs">
                Weave could not read this page safely ({consent.reason}) — finish it in the
                terminal below.
              </p>
            )}

            {running && !showCard && (
              <pre
                ref={screenRef}
                tabIndex={0}
                role="application"
                aria-label={`${setup.engineLabel} setup terminal`}
                onKeyDown={(event) => {
                  const key = KEY_BY_EVENT[event.key];
                  if (!key) return;
                  event.preventDefault();
                  onKey(key);
                }}
                className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-agent-border/60 bg-agent-code-bg p-3 font-mono text-[11px] text-agent-text-muted leading-relaxed outline-none focus:ring-1 focus:ring-agent-warn/50"
              >
                {setup.lines.join("\n") || "Starting…"}
              </pre>
            )}
          </PromptCardBody>

          <PromptCardFooter>
            {running && showCard ? (
              <PromptCardButton variant="secondary" onClick={onCancel}>
                Cancel
              </PromptCardButton>
            ) : running ? (
              <>
                <span className="mr-auto text-agent-text-faint text-xs">
                  Click the terminal, then follow the hint — Enter toggles, ↑/↓ moves, [Done] finishes.
                </span>
                <PromptCardButton variant="secondary" onClick={onCancel}>
                  Cancel
                </PromptCardButton>
              </>
            ) : (
              <PromptCardButton variant="primary" onClick={() => onStart(setup.engineId)}>
                {setup.status === "failed" ? "Try setup again" : "Run setup"}
              </PromptCardButton>
            )}
          </PromptCardFooter>
        </>
      )}
    </PromptCard>
  );
}
