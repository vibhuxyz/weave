import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isInside } from "@weave/agent";
import type { Contract } from "./types.ts";

export async function writeContract(projectRoot: string, contract: Contract): Promise<void> {
  const targets = contract.files.map((file) => ({ file, target: resolve(projectRoot, file.path) }));
  const escaping = targets.find(({ target }) => !isInside(projectRoot, target));
  if (escaping) throw new Error(`Contract file ${escaping.file.path} resolves outside ${projectRoot}`);

  await Promise.all(
    targets.map(async ({ file, target }) => {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }),
  );
}
