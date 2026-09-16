import type { BuiltinSkill } from "./types.ts";

export const securitySkill: BuiltinSkill = {
  name: "security",
  description: "Avoiding common vulnerability classes while editing code.",
  body:
    "Watch for injection (SQL, command, template), unvalidated redirects, " +
    "secrets in code or logs, and missing authorization checks on new " +
    "endpoints. Flag anything you are not confident is safe rather than " +
    "silently shipping it.",
};
