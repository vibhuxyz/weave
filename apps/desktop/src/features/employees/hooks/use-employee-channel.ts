import { useCallback, useRef, type RefObject } from "react";
import type { ClientMessage, ServerMessage } from "../../../../server/index.ts";
import { useEmployeeStore } from "../store";
import type { EmployeeChangeResult } from "../types";

const NOT_CONNECTED = "Not connected to the project server. Open a project and try again.";
const CONNECTION_CLOSED = "The connection to the project server closed before the change was confirmed. Reload the list to check it.";

type ChangeMessage = Extract<ClientMessage, { readonly type: "save-employee" | "delete-employee" }>;

export function useEmployeeChannel(socketRef: RefObject<WebSocket | null>) {
  const pendingRef = useRef(new Map<string, (result: EmployeeChangeResult) => void>());

  const sendMessage = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, [socketRef]);

  const settle = useCallback((requestId: string, result: EmployeeChangeResult) => {
    pendingRef.current.get(requestId)?.(result);
    pendingRef.current.delete(requestId);
  }, []);

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    const store = useEmployeeStore.getState();
    switch (message.type) {
      case "employees":
      case "employees-failed":
        store.receiveListing(message);
        return true;
      case "employee-detail":
      case "employee-detail-failed":
        store.receiveDetail(message);
        return true;
      case "employee-changed":
        settle(message.requestId, { ok: true, id: message.id });
        return true;
      case "employee-change-failed":
        settle(message.requestId, { ok: false, message: message.message });
        return true;
      default:
        return false;
    }
  }, [settle]);

  const expectListing = useCallback(() => {
    useEmployeeStore.getState().startLoading();
  }, []);

  const readEmployee = useCallback((id: string) => {
    if (sendMessage({ type: "read-employee", id })) useEmployeeStore.getState().requestDetail(id);
  }, [sendMessage]);

  const change = useCallback((build: (requestId: string) => ChangeMessage) =>
    new Promise<EmployeeChangeResult>((resolve) => {
      const requestId = crypto.randomUUID();
      if (!sendMessage(build(requestId))) {
        resolve({ ok: false, message: NOT_CONNECTED });
        return;
      }
      pendingRef.current.set(requestId, resolve);
    }), [sendMessage]);

  const saveEmployee = useCallback((fields: unknown, replacesId: string | null) =>
    change((requestId) => ({ type: "save-employee", requestId, fields, replacesId })), [change]);

  const deleteEmployee = useCallback((id: string) =>
    change((requestId) => ({ type: "delete-employee", requestId, id })), [change]);

  const disconnect = useCallback(() => {
    for (const resolve of pendingRef.current.values()) resolve({ ok: false, message: CONNECTION_CLOSED });
    pendingRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    disconnect();
    useEmployeeStore.getState().reset();
  }, [disconnect]);

  return { handleMessage, expectListing, readEmployee, saveEmployee, deleteEmployee, disconnect, reset };
}
