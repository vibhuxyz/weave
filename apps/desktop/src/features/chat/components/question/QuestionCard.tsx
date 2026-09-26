import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_OPTION_SHORTCUTS, useQuestionForm, type AnswerQuestion, type QuestionState } from "@/features/chat/hooks";
import {
  PromptCard,
  PromptCardHeader,
  PromptCardBody,
  PromptCardFooter,
  PromptCardButton,
} from "../PromptCard";
import { NoticeList } from "./NoticeList";
import { shortcutIndexOf } from "./option-shortcut";
import { QuestionStepBody } from "./QuestionStepBody";

export function QuestionCard({ state, onAnswer }: { state: QuestionState; onAnswer: AnswerQuestion }) {
  const form = useQuestionForm(state, onAnswer);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { request } = state;
  const { step, steps } = form;
  const error = state.status === "open" ? state.error : null;
  const hasManySteps = steps.length > 1;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.next();
  };

  const pickByShortcut = (event: KeyboardEvent<HTMLFormElement>) => {
    const index = shortcutIndexOf(event);
    if (index === null || !step || index >= MAX_OPTION_SHORTCUTS) return;
    const option = step.options[index];
    if (option) {
      event.preventDefault();
      form.pick(option.value);
      return;
    }
    if (index !== step.options.length || step.otherKey === null) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLInputElement>("[data-question-input]")?.focus();
  };

  return (
    <PromptCard
      as="form"
      onSubmit={submit}
      onKeyDown={pickByShortcut}
      aria-label="The agent has a question"
    >
      <PromptCardHeader
        badge={hasManySteps ? `${form.stepIndex + 1}/${steps.length}` : null}
        badgeVariant="warn"
        title={step?.heading ?? request.message}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(!isCollapsed)}
        onClose={form.decline}
        closeDisabled={form.isSending}
        closeLabel="Dismiss question"
      />
      {!isCollapsed && (
        <>
          <PromptCardBody>
            {hasManySteps && form.stepIndex === 0 && (
              <p className="max-h-40 overflow-auto whitespace-pre-wrap text-agent-text-muted text-xs">{request.message}</p>
            )}
            {step?.label && <p className="text-agent-text-muted text-xs">{step.label}</p>}
            {step?.help && <p className="whitespace-pre-wrap text-agent-text-muted text-xs">{step.help}</p>}
            {step && (
              <div className="max-h-64 overflow-y-auto pr-0.5">
                <QuestionStepBody
                  key={step.key}
                  step={step}
                  values={form.values}
                  isDisabled={form.isSending}
                  onPick={form.pick}
                  onText={form.setText}
                  onSubmit={form.next}
                />
              </div>
            )}
            <NoticeList notices={request.notices} />
            {error && (
              <p role="alert" className="text-agent-critical text-xs">
                {error}
              </p>
            )}
          </PromptCardBody>
          <PromptCardFooter>
            {form.stepIndex > 0 && (
              <PromptCardButton
                variant="secondary"
                disabled={form.isSending}
                onClick={form.back}
                className="mr-auto"
              >
                Back
              </PromptCardButton>
            )}
            <PromptCardButton
              variant="secondary"
              disabled={form.isSending}
              onClick={form.skip}
            >
              Skip
            </PromptCardButton>
            <PromptCardButton
              variant="primary"
              type="submit"
              disabled={!form.canContinue}
            >
              {form.isSending ? "Sending…" : form.isLastStep ? "Submit" : "Next"}
            </PromptCardButton>
          </PromptCardFooter>
        </>
      )}
    </PromptCard>
  );
}
