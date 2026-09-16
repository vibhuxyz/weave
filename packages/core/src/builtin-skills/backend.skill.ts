import type { BuiltinSkill } from "./types.ts";

export const backendSkill: BuiltinSkill = {
  name: "backend",
  description: "Building and modifying server-side code.",
  body:
    "Keep routes/handlers thin: parse input, call a service, respond. Put " +
    "business logic in a service layer, not in the route handler. Use " +
    "timeouts on every outbound network call.",
};
