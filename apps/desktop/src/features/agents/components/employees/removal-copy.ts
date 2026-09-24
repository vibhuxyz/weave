import type { PendingRemoval } from "@/features/agents/hooks";

export interface RemovalText {
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
}

export function removalCopyFor({ agent, action }: PendingRemoval): RemovalText {
  if (agent.origin.kind === "persona") {
    return { title: `Delete ${agent.name}?`, description: "This saved persona is removed from this computer.", confirm: "Delete" };
  }
  if (action === "reset") {
    return {
      title: `Reset ${agent.name}?`,
      description: "This project's customized file is deleted and the default employee comes back.",
      confirm: "Reset",
    };
  }
  return {
    title: `Delete ${agent.name}?`,
    description: "Its file in .weave/employees is deleted. Its memory file is kept.",
    confirm: "Delete",
  };
}
