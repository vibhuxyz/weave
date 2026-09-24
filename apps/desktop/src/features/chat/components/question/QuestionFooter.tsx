const SECONDARY_BUTTON_CLASS =
  "rounded-lg bg-agent-surface-inset px-3 py-1.5 font-medium text-agent-text text-sm transition-colors hover:bg-agent-surface-hover disabled:opacity-50";

export function QuestionFooter({
  canGoBack,
  isLastStep,
  isSending,
  canContinue,
  onBack,
  onSkip,
}: {
  canGoBack: boolean;
  isLastStep: boolean;
  isSending: boolean;
  canContinue: boolean;
  onBack: () => void;
  onSkip: () => void;
}) {
  const primaryLabel = isSending ? "Sending…" : isLastStep ? "Submit" : "Next";
  return (
    <div className="flex items-center justify-end gap-2">
      {canGoBack && (
        <button type="button" disabled={isSending} onClick={onBack} className={`${SECONDARY_BUTTON_CLASS} mr-auto`}>
          Back
        </button>
      )}
      <button type="button" disabled={isSending} onClick={onSkip} className={SECONDARY_BUTTON_CLASS}>
        Skip
      </button>
      <button
        type="submit"
        disabled={!canContinue}
        className="rounded-lg bg-agent-text-strong px-3 py-1.5 font-medium text-agent-surface-base text-sm transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </div>
  );
}
