import type { TaskPolicy } from "@weave/protocol";
import { confineToTaskDir } from "./confine.ts";
import { extractCommand } from "./command-safety.ts";
import type { PermissionPolicy } from "./types.ts";

const GIT_COMMIT_COMMAND_PATTERN = /(^|[\s;&|])git\s+commit\b/i;

const DEPLOYMENT_COMMAND_PATTERN = new RegExp(
  [
    "vercel\\s+deploy",
    "netlify\\s+deploy",
    "kubectl\\s+apply",
    "kubectl\\s+rollout",
    "docker\\s+push",
    "gh\\s+release",
    "gcloud\\s+app\\s+deploy",
    "gcloud\\s+run\\s+deploy",
    "firebase\\s+deploy",
    "eas\\s+submit",
    "fly\\s+deploy",
    "wrangler\\s+deploy",
    "serverless\\s+deploy",
  ].join("|"),
  "i",
);

const NETWORK_COMMAND_PATTERN = new RegExp(
  [
    "(^|[\\s;&|(])(curl|wget|nc|ncat|ssh|scp|rsync|ftp|telnet)\\s",
    "git\\s+(push|pull|fetch|clone)\\b",
    "(npm|pnpm|yarn|bun)\\s+(install|add|i|update|upgrade)\\b",
    "pip3?\\s+install\\b",
  ].join("|"),
  "i",
);

export function compilePolicyPaths(policy: TaskPolicy | undefined): { allowedPaths?: string[] } {
  const write = policy?.filesystem?.write;
  return write && write.length > 0 ? { allowedPaths: write } : {};
}

function isNetworkDisabled(policy: TaskPolicy, command: string): boolean {
  return policy.network?.allowed === false && NETWORK_COMMAND_PATTERN.test(command);
}

function isGitCommitDisabled(policy: TaskPolicy, command: string): boolean {
  return policy.git?.commit === false && GIT_COMMIT_COMMAND_PATTERN.test(command);
}

function isDeploymentDisabled(policy: TaskPolicy, command: string): boolean {
  return policy.deployment?.allowed === false && DEPLOYMENT_COMMAND_PATTERN.test(command);
}

export function withPolicy(
  policy: TaskPolicy,
  base: PermissionPolicy = confineToTaskDir,
): PermissionPolicy {
  return async (task, request) => {
    const baseDecision = await base(task, request);
    if (baseDecision.decision === "reject") return baseDecision;

    const command = extractCommand(request.toolCall.rawInput);
    if (!command) return baseDecision;

    if (isGitCommitDisabled(policy, command)) {
      return { decision: "reject", reason: "policy: git commit disabled for this task" };
    }
    if (isDeploymentDisabled(policy, command)) {
      return { decision: "reject", reason: "policy: deployment commands disabled for this task" };
    }
    if (isNetworkDisabled(policy, command)) {
      return { decision: "reject", reason: "policy: network commands disabled for this task" };
    }
    return baseDecision;
  };
}
