import { capBytes } from "../shared/index.ts";
import { CONTRACT_PACKAGE_NAME, MAX_SUMMARY_BYTES, WORKSPACE_MANIFEST_PATH, WORKSPACE_TSCONFIG_PATH } from "./constants.ts";
import type { Contract } from "./types.ts";

export function summarizeContract(contract: Contract): string {
  const summary = [
    `version ${contract.version}, ${contract.language}, package "${CONTRACT_PACKAGE_NAME}" at ${contract.entryPath}`,
    `exports: ${contract.exports.join(", ")}`,
    `Import these from ${contract.entryPath} with a relative path. Never copy or re-declare them.`,
    contract.language === "typescript"
      ? `The workspace root already exists: ${WORKSPACE_MANIFEST_PATH} lists the workspaces and ${WORKSPACE_TSCONFIG_PATH} holds the shared compiler options. Extend them from your own package; do not create or edit them.`
      : `The workspace root already exists: ${WORKSPACE_MANIFEST_PATH} lists the workspaces. Do not create or edit it.`,
  ].join("\n");
  return capBytes(summary, MAX_SUMMARY_BYTES);
}
