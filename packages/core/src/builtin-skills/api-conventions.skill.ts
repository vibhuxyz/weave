import type { BuiltinSkill } from "./types.ts";

export const apiConventionsSkill: BuiltinSkill = {
  name: "api-conventions",
  description: "Keeping API contracts consistent across a change.",
  body:
    "Before changing a request/response shape, find every caller of that " +
    "endpoint in this repo and update them together. Do not change a public " +
    "API shape silently — note it in your summary.",
};
