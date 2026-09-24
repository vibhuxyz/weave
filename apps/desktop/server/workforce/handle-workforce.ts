import type { ClientMessage, ServerMessage } from "../shared/index.ts";
import { errorMessage } from "../shared/index.ts";
import { deleteEmployee, listEmployees, saveEmployee, type WorkforcePaths } from "./employees.ts";
import { describeProject } from "./project-model.ts";
import { listSkills } from "./skills.ts";

export type WorkforceMessage = Extract<ClientMessage, { readonly type: "list-employees" | "save-employee" | "delete-employee" | "list-skills" | "project-model" }>;

export interface WorkforceContext extends WorkforcePaths {
  readonly send: (message: ServerMessage) => void;
}

async function sendEmployees(ctx: WorkforceContext): Promise<void> {
  const listing = await listEmployees(ctx);
  ctx.send({ type: "employees", employees: listing.views, skipped: listing.registry.skipped });
}

async function sendSkills(ctx: WorkforceContext): Promise<void> {
  const listing = await listEmployees(ctx);
  ctx.send({ type: "skills", skills: await listSkills(ctx.projectDir, listing.registry.employees) });
}

async function change(ctx: WorkforceContext, result: Promise<{ readonly ok: true; readonly employeeId: string; readonly path: string } | { readonly ok: false; readonly reason: string }>): Promise<void> {
  const outcome = await result;
  if (!outcome.ok) return ctx.send({ type: "employee-error", message: outcome.reason });
  ctx.send({ type: "employee-saved", employeeId: outcome.employeeId, path: outcome.path });
  await sendEmployees(ctx);
}

async function describe(ctx: WorkforceContext, request: unknown): Promise<void> {
  const described = await describeProject(ctx.projectDir, request);
  ctx.send(described.ok ? { type: "project-model", model: described.view } : { type: "project-model-error", message: described.reason });
}

export async function handleWorkforceMessage(message: WorkforceMessage, ctx: WorkforceContext): Promise<void> {
  try {
    switch (message.type) {
      case "list-employees":
        return await sendEmployees(ctx);
      case "save-employee":
        return await change(ctx, saveEmployee(ctx, message.draft));
      case "delete-employee":
        return await change(ctx, deleteEmployee(ctx, message.employeeId));
      case "list-skills":
        return await sendSkills(ctx);
      case "project-model":
        return await describe(ctx, message.request);
      default: {
        const unhandled: never = message;
        return unhandled;
      }
    }
  } catch (error: unknown) {
    const where = message.type === "project-model" ? "project-model-error" : "employee-error";
    ctx.send({ type: where, message: `Cannot ${message.type.replace("-", " ")}: ${errorMessage(error)}` });
  }
}
