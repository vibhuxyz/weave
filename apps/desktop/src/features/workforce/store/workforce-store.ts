import { create } from "zustand";
import type { EmployeeDraft, EmployeeView, Loadable, ProjectModelView, SkillView, Transport, WorkforceMessage } from "../types";

interface WorkforceStore {
  readonly transport: Transport | null;
  readonly employees: Loadable<readonly EmployeeView[]>;
  readonly skipped: readonly { readonly sourcePath: string; readonly reason: string }[];
  readonly saving: { readonly status: "idle" | "saving" } | { readonly status: "error"; readonly message: string } | { readonly status: "saved"; readonly employeeId: string };
  readonly skills: Loadable<readonly SkillView[]>;
  readonly model: Loadable<ProjectModelView>;
  readonly setTransport: (transport: Transport | null) => void;
  readonly receive: (message: WorkforceMessage) => void;
  readonly refreshEmployees: () => void;
  readonly refreshSkills: () => void;
  readonly saveEmployee: (draft: EmployeeDraft) => void;
  readonly deleteEmployee: (employeeId: string) => void;
  readonly describeProject: (request: string | null) => void;
}

function applyMessage(message: WorkforceMessage): Partial<WorkforceStore> {
  switch (message.type) {
    case "employees":
      return { employees: { status: "ready", value: message.employees }, skipped: message.skipped };
    case "employee-saved":
      return { saving: { status: "saved", employeeId: message.employeeId } };
    case "employee-error":
      return { saving: { status: "error", message: message.message } };
    case "skills":
      return { skills: { status: "ready", value: message.skills } };
    case "project-model":
      return { model: { status: "ready", value: message.model } };
    case "project-model-error":
      return { model: { status: "error", message: message.message } };
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

export const useWorkforceStore = create<WorkforceStore>((set, get) => {
  const send = (payload: Readonly<Record<string, unknown>>): boolean => {
    const transport = get().transport;
    transport?.(payload);
    return transport !== null;
  };
  return {
    transport: null,
    employees: { status: "idle" },
    skipped: [],
    saving: { status: "idle" },
    skills: { status: "idle" },
    model: { status: "idle" },
    setTransport: (transport) => set({ transport }),
    receive: (message) => set(applyMessage(message)),
    refreshEmployees: () => {
      if (send({ type: "list-employees" }) && get().employees.status !== "ready") set({ employees: { status: "loading" } });
    },
    refreshSkills: () => {
      if (send({ type: "list-skills" })) set({ skills: { status: "loading" } });
    },
    saveEmployee: (draft) => {
      if (send({ type: "save-employee", draft })) set({ saving: { status: "saving" } });
    },
    deleteEmployee: (employeeId) => {
      if (send({ type: "delete-employee", employeeId })) set({ saving: { status: "saving" } });
    },
    describeProject: (request) => {
      if (send({ type: "project-model", request })) set({ model: { status: "loading" } });
    },
  };
});
