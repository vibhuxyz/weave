import type { AnsweredQuestion } from "@/features/chat/hooks";

export function AnsweredQuestions({ answers }: { answers: readonly AnsweredQuestion[] }) {
  return (
    <dl className="flex flex-col gap-3 rounded-xl border border-agent-border px-4 py-3 text-sm">
      {answers.map((item, index) => (
        <div key={`${index}:${item.question}`} className="flex flex-col gap-0.5">
          <dt className="text-agent-text-muted">{item.question}</dt>
          <dd className="text-agent-text-strong">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
