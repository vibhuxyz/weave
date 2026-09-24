import { useEmployeeStore } from "../store";
import type { EmployeeDetailState, EmployeeListing } from "../types";

export function useEmployeeListing(): EmployeeListing {
  return useEmployeeStore((state) => state.listing);
}

export function useEmployeeDetail(id: string): EmployeeDetailState | undefined {
  return useEmployeeStore((state) => state.details.get(id));
}
