import { useEffect, useRef, useState } from "react";
import { TerminalIcon } from "lucide-react";
import { Button } from "@/shared/ui";
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
    <div className="dark w-full rounded-xl border border-agent-warn/40 bg-agent-warn-bg">
      <div className="flex items-start gap-2.5 border-agent-warn/20 border-b px-4 py-3">
        <TerminalIcon className="mt-0.5 size-4 shrink-0 text-agent-warn" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-agent-warn text-sm">
            {setup.engineLabel} needs first-run setup
          </span>
          <span className="text-agent-text text-xs">{setup.description}</span>
          {setup.error && (
            <span className="text-agent-critical-fg text-xs">{setup.error}</span>
          )}
        </div>
      </div>

      {showCard && consent.kind === "card" && (
        <div className="px-4 pb-3">
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
        </div>
      )}

      {showCard && consent.kind === "applying" && (
        <p className="px-4 pb-3 text-agent-text-faint text-xs">
          Finishing setup…
        </p>
      )}

      {consent?.kind === "manual" && running && (
        <p className="px-4 pb-1 text-agent-warn text-xs">
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
          className="mx-4 my-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-agent-code-bg p-3 font-mono text-[11px] text-agent-text-muted leading-relaxed outline-none focus:ring-1 focus:ring-agent-warn/50"
        >
          {setup.lines.join("\n") || "Starting…"}
        </pre>
      )}

      <div className="flex items-center gap-2 px-4 py-3">
        {running && showCard ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
        ) : running ? (
          <>
            <span className="text-agent-text-faint text-xs">
              Click the terminal, then follow the hint at the bottom of the
              screen — Enter toggles the highlighted item, ↑/↓ moves between
              them. Reach <span className="font-mono">[Done]</span> and press
              Enter to finish.
            </span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onStart(setup.engineId)}>
            {setup.status === "failed" ? "Try setup again" : "Run setup"}
          </Button>
        )}
      </div>
    </div>
  );
}
