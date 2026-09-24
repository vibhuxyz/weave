import type { EmployeePermissions, MemoryPolicy } from "./types.ts";

export const EMPLOYEE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_NAME_CHARS = 100;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_INSTRUCTIONS_CHARS = 12_000;
export const MAX_LIST_ITEMS = 40;
export const MAX_ITEM_CHARS = 300;
export const MAX_EMPLOYEE_FILE_BYTES = 64 * 1024;
export const MAX_EMPLOYEES = 100;

export const DEFAULT_PERMISSIONS: EmployeePermissions = {
  filesystem: { read: ["**/*"], write: ["**/*"] },
  deployment: { allowed: false },
  network: { allowed: true },
  git: { commit: false },
};

export const DEFAULT_MEMORY: MemoryPolicy = { enabled: true, maxEntries: 200, recallCount: 8 };
