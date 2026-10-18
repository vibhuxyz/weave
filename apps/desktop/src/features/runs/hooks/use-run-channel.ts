import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ChatTurn } from "@/features/chat/hooks";
import type { ResultDecision, ServerMessage } from "../../../../server/index.ts";
import { isRunSettled, runToTurn } from "../lib/run-to-turn";
import { teamStartMessage, type RunImageInput } from "../route-draft";
import { useRunStore } from "../store";
import type { RunMessage } from "../types";

function isRunMessage(message: ServerMessage): message is RunMessage {
  return message.type === "run-started" || message.type === "run-update" || message.type === "run-finished";
}

export function useRunChannel(socketRef: RefObject<WebSocket | null>, turnSinkRef: RefObject<(turn: ChatTurn) => void>) {
  const pendingRef = useRef<RunMessage[]>([]);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const batch = pendingRef.current;
    pendingRef.current = [];
    const { applyMessages, dismiss } = useRunStore.getState();
    applyMessages(batch);
    const run = useRunStore.getState().run;
    if (run === null || !isRunSettled(run)) return;
    const turn = runToTurn(run, Date.now());
    if (turn) turnSinkRef.current(turn);
    dismiss();
  }, [turnSinkRef]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handleMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (!isRunMessage(message)) return false;
      pendingRef.current.push(message);
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
      return true;
    },
    [flush],
  );

  const sendMessage = useCallback(
    (payload: object) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    [socketRef],
  );

  const startRun = useCallback(
    (request: string, images?: readonly RunImageInput[]) => sendMessage(teamStartMessage(request, images)),
    [sendMessage],
  );
  const cancelRun = useCallback(() => sendMessage({ type: "cancel-run" }), [sendMessage]);
  const resumeTask = useCallback((taskId: string) => sendMessage({ type: "resume-task", taskId }), [sendMessage]);
  const decidePlan = useCallback((runKey: string, approved: boolean) => sendMessage({ type: "decide-run-plan", runKey, approved }), [sendMessage]);
  const decideResult = useCallback((runKey: string, decision: ResultDecision) => sendMessage({ type: "decide-run-result", runKey, decision }), [sendMessage]);

  return { handleMessage, startRun, cancelRun, resumeTask, decidePlan, decideResult };
}
