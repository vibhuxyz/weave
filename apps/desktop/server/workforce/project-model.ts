import { buildProjectModel, queryProject, weaveDirFor } from "@weave/core";
import type { ProjectModelView } from "../shared/index.ts";
import { MAX_REQUEST_CHARS } from "./constants.ts";
import { toModelView, toQueryView } from "./model-view.ts";

export type ModelResult = { readonly ok: true; readonly view: ProjectModelView } | { readonly ok: false; readonly reason: string };

function requestOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const request = raw.replace(/\s+/g, " ").trim();
  return request === "" ? null : request.slice(0, MAX_REQUEST_CHARS);
}

export async function describeProject(projectDir: string, rawRequest: unknown): Promise<ModelResult> {
  const started = performance.now();
  const { model } = await buildProjectModel({ root: projectDir, weaveDir: weaveDirFor(projectDir) });
  const buildMs = performance.now() - started;
  const request = requestOf(rawRequest);
  const query = request ? toQueryView(model, queryProject(model, request)) : null;
  return { ok: true, view: toModelView(model, buildMs, query) };
}
