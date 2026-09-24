import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectModel } from "../types.ts";
import { apisDoc } from "./apis-doc.ts";
import { architectureDoc } from "./architecture-doc.ts";
import { dataFlowDoc } from "./data-flow-doc.ts";

export type ProjectDocs = Readonly<Record<"architecture.md" | "apis.md" | "data-flow.md", string>>;

export function generateProjectDocs(model: ProjectModel): ProjectDocs {
  return { "architecture.md": architectureDoc(model), "apis.md": apisDoc(model), "data-flow.md": dataFlowDoc(model) };
}

export async function writeProjectDocs(dir: string, docs: ProjectDocs): Promise<readonly string[]> {
  await mkdir(dir, { recursive: true });
  const entries = Object.entries(docs).sort(([a], [b]) => a.localeCompare(b));
  await Promise.all(entries.map(([name, text]) => writeFile(join(dir, name), text)));
  return entries.map(([name]) => join(dir, name));
}
