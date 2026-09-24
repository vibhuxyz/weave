import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isInside } from "@weave/agent";
import { describeDrift, findRedeclaredSymbols, type Contract, type SourceFile } from "../contracts/index.ts";
import { isNotFound, type Ledger } from "../shared/index.ts";
import type { InspectHarvest } from "../pool/index.ts";

const MAX_INSPECTED_FILES = 200;
const MAX_INSPECTED_FILE_BYTES = 256_000;

async function readSource(root: string, path: string, skip: (reason: string) => void): Promise<SourceFile | null> {
  const absolute = resolve(root, path);
  if (!isInside(root, absolute)) {
    skip(`${path} resolves outside the worktree`);
    return null;
  }
  try {
    const stats = await lstat(absolute);
    if (!stats.isFile()) return null;
    if (stats.size > MAX_INSPECTED_FILE_BYTES) {
      skip(`${path} is ${stats.size} bytes, over ${MAX_INSPECTED_FILE_BYTES}`);
      return null;
    }
    return { path, content: await readFile(absolute, "utf8") };
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function contractDriftInspector(contract: Pick<Contract, "exports" | "entryPath">, ledger: Ledger): InspectHarvest {
  return async (task, worktreePath, files) => {
    const skip = (reason: string) => ledger.append("error", { taskId: task.id, where: "contract-drift-check", message: `skipped ${reason}` });
    if (files.length > MAX_INSPECTED_FILES) skip(`${files.length - MAX_INSPECTED_FILES} file(s) past the first ${MAX_INSPECTED_FILES}`);
    const sources = await Promise.all(files.slice(0, MAX_INSPECTED_FILES).map((path) => readSource(worktreePath, path, skip)));
    const findings = findRedeclaredSymbols(sources.filter((source): source is SourceFile => source !== null), contract.exports);
    return findings.length > 0 ? describeDrift(findings, contract.entryPath) : null;
  };
}
