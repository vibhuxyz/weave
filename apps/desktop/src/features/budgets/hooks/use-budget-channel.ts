import { useCallback, useRef, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useBudgetStore } from "../store";
import type { BudgetSaveResult, BudgetSettings } from "../types";

const NOT_CONNECTED = "Not connected to the project server. Open a project and try again.";
const CONNECTION_CLOSED = "The connection to the project server closed before the limits were confirmed. Reload the page to check them.";

export function useBudgetChannel(socketRef: RefObject<WebSocket | null>) {
  const pendingRef = useRef(new Map<string, (result: BudgetSaveResult) => void>());

  const sendMessage = useCallback((payload: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, [socketRef]);

  const settle = useCallback((requestId: string, result: BudgetSaveResult) => {
    pendingRef.current.get(requestId)?.(result);
    pendingRef.current.delete(requestId);
  }, []);

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    switch (message.type) {
      case "budgets":
      case "budgets-failed":
        useBudgetStore.getState().receive(message);
        return true;
      case "budgets-saved":
        settle(message.requestId, { ok: true });
        return true;
      case "budgets-save-failed":
        settle(message.requestId, { ok: false, message: message.message });
        return true;
      default:
        return false;
    }
  }, [settle]);

  const readBudgets = useCallback(() => {
    if (sendMessage({ type: "read-budgets" })) useBudgetStore.getState().startLoading();
  }, [sendMessage]);

  const saveBudgets = useCallback((settings: BudgetSettings) => new Promise<BudgetSaveResult>((resolve) => {
    const requestId = crypto.randomUUID();
    if (!sendMessage({ type: "save-budgets", requestId, settings })) {
      resolve({ ok: false, message: NOT_CONNECTED });
      return;
    }
    pendingRef.current.set(requestId, resolve);
  }), [sendMessage]);

  const disconnect = useCallback(() => {
    for (const resolve of pendingRef.current.values()) resolve({ ok: false, message: CONNECTION_CLOSED });
    pendingRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    disconnect();
    useBudgetStore.getState().reset();
  }, [disconnect]);

  return { handleMessage, readBudgets, saveBudgets, disconnect, reset };
}
