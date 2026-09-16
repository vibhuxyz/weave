import type { BuiltinSkill } from "./types.ts";

export const testingSkill: BuiltinSkill = {
  name: "testing",
  description: "Writing and updating tests alongside a change.",
  body:
    "When you change behavior, update or add the test that covers it. " +
    "Prefer a test that exercises real behavior over one that mocks the " +
    "thing it is supposed to verify.",
};
