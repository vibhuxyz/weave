import { errorMessage, type EmployeeClientMessage } from "../shared/index.ts";
import { sendSkillListing, type SkillListingContext } from "../skills/index.ts";
import { deleteEmployee } from "./delete-employee.ts";
import { listEmployees } from "./load-employees.ts";
import { readEmployee } from "./read-employee.ts";
import { saveEmployee, type EmployeeChange } from "./save-employee.ts";

export type EmployeeMessageContext = SkillListingContext;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function sendListing(ctx: EmployeeMessageContext): Promise<void> {
  try {
    ctx.send({ type: "employees", ...(await listEmployees(ctx.projectDir)) });
  } catch (error) {
    ctx.send({ type: "employees-failed", message: `Cannot load employees for ${ctx.projectDir}: ${errorMessage(error)}` });
  }
}

async function applyChange(requestId: unknown, change: () => Promise<EmployeeChange>, ctx: EmployeeMessageContext): Promise<void> {
  if (!isNonEmptyString(requestId)) {
    ctx.send({ type: "error", message: "Cannot change an employee: the request has no requestId." });
    return;
  }
  const result = await change().catch((error: unknown): EmployeeChange => ({ ok: false, message: errorMessage(error) }));
  if (!result.ok) {
    ctx.send({ type: "employee-change-failed", requestId, message: result.message });
    return;
  }
  await Promise.all([sendListing(ctx), sendSkillListing(ctx)]);
  ctx.send({ type: "employee-changed", requestId, id: result.id });
}

async function sendDetail(id: unknown, ctx: EmployeeMessageContext): Promise<void> {
  if (!isNonEmptyString(id)) {
    ctx.send({ type: "error", message: "Cannot read an employee: the request has no id." });
    return;
  }
  const read = await readEmployee(ctx.projectDir, id).catch((error: unknown) => ({ ok: false as const, message: errorMessage(error) }));
  ctx.send(read.ok ? { type: "employee-detail", detail: read.detail } : { type: "employee-detail-failed", id, message: read.message });
}

export function handleEmployeeMessage(msg: EmployeeClientMessage, ctx: EmployeeMessageContext): Promise<void> {
  switch (msg.type) {
    case "list-employees":
      return sendListing(ctx);
    case "read-employee":
      return sendDetail(msg.id, ctx);
    case "save-employee":
      return applyChange(msg.requestId, () => saveEmployee({ projectDir: ctx.projectDir, fields: msg.fields, replacesId: isNonEmptyString(msg.replacesId) ? msg.replacesId : null }), ctx);
    case "delete-employee":
      return applyChange(msg.requestId, () => isNonEmptyString(msg.id) ? deleteEmployee(ctx.projectDir, msg.id) : Promise.resolve({ ok: false, message: "Cannot delete an employee: the request has no id." }), ctx);
    default: {
      const exhaustive: never = msg;
      ctx.send({ type: "error", message: `Unknown employee message: ${JSON.stringify(exhaustive)}` });
      return Promise.resolve();
    }
  }
}
