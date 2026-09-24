import { useCallback, useRef, useState, type RefObject } from "react";
import type { ServerMessage } from "../../../../../server/index.ts";
import type { AnsweredQuestion, QuestionAnswers, QuestionState } from "./types";

const NOT_CONNECTED_MESSAGE = "Not connected to Weave. Reconnect, then answer again.";

export function useQuestionChannel(
  socketRef: RefObject<WebSocket | null>,
  onAnswered: (answered: readonly AnsweredQuestion[]) => void,
) {
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const sentAnswersRef = useRef(new Map<string, readonly AnsweredQuestion[]>());

  const closeQuestion = useCallback(
    (requestId: string) => {
      const answered = sentAnswersRef.current.get(requestId);
      sentAnswersRef.current.delete(requestId);
      if (answered && answered.length > 0) onAnswered(answered);
      setQuestion((current) => (current?.request.requestId === requestId ? null : current));
    },
    [onAnswered],
  );

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    switch (message.type) {
      case "question-request":
        setQuestion({
          status: "open",
          request: {
            requestId: message.requestId,
            message: message.message,
            fields: message.fields,
            notices: message.notices,
          },
          error: null,
        });
        return true;
      case "question-invalid":
        sentAnswersRef.current.delete(message.requestId);
        setQuestion((current) =>
          current?.request.requestId === message.requestId
            ? { status: "open", request: current.request, error: message.message }
            : current,
        );
        return true;
      case "question-closed":
        closeQuestion(message.requestId);
        return true;
      case "turn-end":
        sentAnswersRef.current.clear();
        setQuestion(null);
        return false;
      default:
        return false;
    }
  }, [closeQuestion]);

  const answer = useCallback(
    (requestId: string, answers: QuestionAnswers | null, answered: readonly AnsweredQuestion[]) => {
      const socket = socketRef.current;
      const isCurrent = (current: QuestionState | null): current is QuestionState =>
        current?.request.requestId === requestId;
      if (socket?.readyState !== WebSocket.OPEN) {
        setQuestion((current) =>
          isCurrent(current)
            ? { status: "open", request: current.request, error: NOT_CONNECTED_MESSAGE }
            : current,
        );
        return;
      }
      setQuestion((current) =>
        isCurrent(current) ? { status: "sending", request: current.request } : current,
      );
      sentAnswersRef.current.set(requestId, answered);
      socket.send(JSON.stringify({ type: "question-response", requestId, answers }));
    },
    [socketRef],
  );

  const reset = useCallback(() => {
    sentAnswersRef.current.clear();
    setQuestion(null);
  }, []);

  return { question, handleMessage, answer, reset };
}
