import { mayOverlap } from "../../decide/index.ts";
import { AREAS_REASON, MAX_AREAS, ONE_AREA_REASON } from "./constants.ts";
import type { Assessment, RankedPath, WorkArea, WorkspaceRef } from "./types.ts";

const CONTRACT_AREA = /(^|\/)(contracts?|schemas?|zod-schema)(\/|$)/i;
const AREA_TOKEN = /(?:^|[\s`'"(])((?:[\w.@-]+\/)+[\w.@-]+)(?=$|[\s`'"),:;!?])/g;

function roleOf(dir: string, name: string): WorkArea["role"] {
  return CONTRACT_AREA.test(dir) || CONTRACT_AREA.test(name) ? "contract" : "module";
}

function mentions(request: string, workspace: WorkspaceRef): boolean {
  const dir = workspace.dir.replace(/\/$/, "");
  if (dir.length > 1 && request.toLowerCase().includes(dir.toLowerCase())) return true;
  if (workspace.name.length < 3) return false;
  const escaped = workspace.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, "i").test(request);
}

function areaKey(path: string): string {
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  return parts.slice(0, Math.min(2, parts.length)).join("/");
}

function requestDirs(request: string): readonly string[] {
  return [...new Set([...request.matchAll(AREA_TOKEN)].flatMap((match) => {
    const dir = match[1] ? areaKey(match[1]) : "";
    return dir.includes("/") ? [dir] : [];
  }))].sort();
}

function collapse(dirs: readonly string[]): readonly string[] {
  const kept: string[] = [];
  for (const dir of [...dirs].sort((left, right) => left.length - right.length || left.localeCompare(right))) {
    const nested = kept.some((earlier) => mayOverlap(`${earlier}/**`, `${dir}/**`));
    if (!nested) kept.push(dir);
  }
  return kept.sort().slice(0, MAX_AREAS);
}

function meaningful(dir: string): boolean {
  const cleaned = dir.replace(/\/$/, "");
  return cleaned !== "" && cleaned !== ".";
}

function decisionFor(areas: readonly WorkArea[]): Assessment {
  if (areas.length < 2) return { decision: "stay", reason: ONE_AREA_REASON, areas, contractFirst: false };
  const contractFirst = areas.some((area) => area.role === "contract") && areas.some((area) => area.role === "module");
  return { decision: "plan", reason: AREAS_REASON, areas, contractFirst };
}

function ownedWorkspaces(files: readonly RankedPath[], byName: ReadonlyMap<string, WorkspaceRef>): readonly WorkspaceRef[] {
  return files.flatMap((file) => {
    const workspace = file.workspace ? byName.get(file.workspace) : undefined;
    return workspace ? [workspace] : [];
  });
}

export function assessParallelism(input: {
  readonly request: string;
  readonly workspaces: readonly WorkspaceRef[];
  readonly files: readonly RankedPath[];
}): Assessment {
  const real = input.workspaces.filter((workspace) => meaningful(workspace.dir));
  const byName = new Map(real.map((workspace) => [workspace.name, workspace]));
  const named = real.filter((workspace) => mentions(input.request, workspace));
  const fromModel = [...new Map([...named, ...ownedWorkspaces(input.files, byName)].map((workspace) => [workspace.dir, workspace])).values()];
  const requested = requestDirs(input.request).filter((dir) => meaningful(dir) && !fromModel.some((workspace) => mayOverlap(`${workspace.dir}/**`, `${dir}/**`)));
  const dirs = collapse([...fromModel.map((workspace) => workspace.dir), ...requested]);
  const areas = dirs.map((dir) => {
    const workspace = fromModel.find((candidate) => candidate.dir === dir);
    return { id: dir, dir, role: roleOf(dir, workspace?.name ?? dir) };
  });
  return decisionFor(areas);
}

export function areasForPaths(paths: readonly string[], workspaces: readonly WorkspaceRef[]): readonly WorkArea[] {
  const dirs = paths.flatMap((path) => {
    const owner = workspaces
      .filter((workspace) => path === workspace.dir || path.startsWith(`${workspace.dir.replace(/\/$/, "")}/`))
      .sort((left, right) => right.dir.length - left.dir.length)[0];
    if (owner) return [owner.dir];
    const parts = path.split("/").filter((part) => part !== "");
    return parts.length < 2 ? [] : [parts.slice(0, 2).join("/")];
  });
  return collapse(dirs).map((dir) => {
    const workspace = workspaces.find((candidate) => candidate.dir === dir);
    return { id: dir, dir, role: roleOf(dir, workspace?.name ?? dir) };
  });
}
