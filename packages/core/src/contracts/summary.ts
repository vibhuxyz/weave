import { capBytes } from "../shared/index.ts";
import { CONTRACT_PACKAGE_NAME, MAX_SUMMARY_BYTES } from "./constants.ts";
import type { Contract } from "./types.ts";

export function summarizeContract(contract: Contract): string {
  const summary = [
    `version ${contract.version}, ${contract.language}, package "${CONTRACT_PACKAGE_NAME}" at ${contract.entryPath}`,
    `exports: ${contract.exports.join(", ")}`,
    `Import these from ${contract.entryPath} with a relative path. Never copy or re-declare them.`,
  ].join("\n");
  return capBytes(summary, MAX_SUMMARY_BYTES);
}
