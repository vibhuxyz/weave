import type { QuestionNotice } from "@/features/chat/hooks";

export function NoticeList({ notices }: { notices: readonly QuestionNotice[] }) {
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
