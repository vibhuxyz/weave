import { useCallback, useState, type RefObject } from "react";
import type { ServerMessage } from "../../../../../server/index.ts";
import type { QuestionAnswers, QuestionState } from "./types";

const NOT_CONNECTED_MESSAGE = "Not connected to Weave. Reconnect, then answer again.";

export function useQuestionChannel(socketRef: RefObject<WebSocket | null>) {
  const [question, setQuestion] = useState<QuestionState | null>(null);

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
        setQuestion((current) =>
          current?.request.requestId === message.requestId
            ? { status: "open", request: current.request, error: message.message }
            : current,
        );
        return true;
      case "question-closed":
        setQuestion((current) => (current?.request.requestId === message.requestId ? null : current));
        return true;
      case "turn-end":
        setQuestion(null);
        return false;
      default:
        return false;
    }
  }, []);

  const answer = useCallback(
    (requestId: string, answers: QuestionAnswers | null) => {
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
      socket.send(JSON.stringify({ type: "question-response", requestId, answers }));
    },
    [socketRef],
  );

  const reset = useCallback(() => setQuestion(null), []);

  return { question, handleMessage, answer, reset };
}
