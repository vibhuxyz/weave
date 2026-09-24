import { useState, type FormEvent } from "react";
import { MessageCircleQuestionIcon } from "lucide-react";
import {
  hasMissingRequired,
  toAnswerPayload,
  type QuestionAnswers,
  type QuestionFormValue,
  type QuestionFormValues,
  type QuestionNotice,
  type QuestionState,
} from "@/features/chat/hooks";
import { QuestionFieldInput } from "./QuestionFieldInput";

function NoticeList({ notices }: { notices: readonly QuestionNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="rounded-md bg-agent-warn-bg px-3 py-2 text-agent-warn text-xs">
      <p>Part of this question could not be shown:</p>
      <ul className="mt-1 list-disc pl-4">
        {notices.map((notice) => (
          <li key={`${notice.key}:${notice.message}`}>
            {notice.key ? `${notice.key}: ${notice.message}` : notice.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuestionCard({
  state,
  onAnswer,
}: {
  state: QuestionState;
  onAnswer: (requestId: string, answers: QuestionAnswers | null) => void;
}) {
  const { request } = state;
  const [values, setValues] = useState<QuestionFormValues>({});
  const isSending = state.status === "sending";
  const error = state.status === "open" ? state.error : null;
  const canSubmit = !isSending && !hasMissingRequired(request.fields, values);

  const setValue = (key: string, value: QuestionFormValue) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onAnswer(request.requestId, toAnswerPayload(request.fields, values));
  };

  return (
    <form
      onSubmit={submit}
      className="dark w-full rounded-xl border border-agent-accent/40 bg-agent-surface-raised"
      aria-label="The agent has a question"
    >
      <div className="flex items-start gap-2.5 border-agent-border border-b px-4 py-3">
        <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-agent-accent" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium text-agent-accent text-sm">The agent is asking</span>
          <p className="max-h-60 overflow-auto whitespace-pre-wrap text-agent-text text-sm">
            {request.message}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-3">
        {request.fields.map((field) => (
          <QuestionFieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            isDisabled={isSending}
            onChange={setValue}
          />
        ))}
        <NoticeList notices={request.notices} />
        {error && (
          <p role="alert" className="text-agent-critical text-xs">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-agent-border border-t px-4 py-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-white px-3 py-1 font-medium text-black text-xs transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {isSending ? "Sending…" : "Send answer"}
        </button>
        <button
          type="button"
          disabled={isSending}
          onClick={() => onAnswer(request.requestId, null)}
          className="rounded-full border border-agent-border px-3 py-1 font-medium text-agent-text text-xs transition-colors hover:bg-agent-surface-hover disabled:opacity-50"
        >
          Skip question
        </button>
      </div>
    </form>
  );
}
