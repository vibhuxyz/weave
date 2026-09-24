import { create } from "zustand";
import type { EmployeeDetailMessage, EmployeeDetailState, EmployeeListing, EmployeeListingMessage } from "../types";

interface EmployeeStore {
  readonly listing: EmployeeListing;
  readonly details: ReadonlyMap<string, EmployeeDetailState>;
  readonly startLoading: () => void;
  readonly requestDetail: (id: string) => void;
  readonly receiveListing: (message: EmployeeListingMessage) => void;
  readonly receiveDetail: (message: EmployeeDetailMessage) => void;
  readonly reset: () => void;
}

function listingOf(message: EmployeeListingMessage): EmployeeListing {
  return message.type === "employees"
    ? { status: "ready", entries: message.entries, skipped: message.skipped }
    : { status: "error", message: message.message };
}

function detailOf(message: EmployeeDetailMessage): readonly [string, EmployeeDetailState] {
  return message.type === "employee-detail"
    ? [message.detail.id, { status: "ready", detail: message.detail }]
    : [message.id, { status: "error", message: message.message }];
}

export const useEmployeeStore = create<EmployeeStore>((set) => ({
  listing: { status: "idle" },
  details: new Map(),
  startLoading: () => set((state) => (state.listing.status === "ready" ? state : { listing: { status: "loading" } })),
  requestDetail: (id) => set((state) => ({ details: new Map(state.details).set(id, { status: "loading" }) })),
  receiveListing: (message) => set({ listing: listingOf(message), details: new Map() }),
  receiveDetail: (message) => set((state) => {
    const [id, detail] = detailOf(message);
    return { details: new Map(state.details).set(id, detail) };
  }),
  reset: () => set({ listing: { status: "idle" }, details: new Map() }),
}));
