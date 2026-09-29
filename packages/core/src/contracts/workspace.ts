import type { Blueprint } from "../blueprint/index.ts";
import { CONTRACT_DIR, WORKSPACE_MANIFEST_PATH, WORKSPACE_PACKAGE_NAME, WORKSPACE_TSCONFIG_PATH } from "./constants.ts";
import type { ContractLanguage } from "./render/index.ts";
import type { ContractFile } from "./types.ts";

const PATH_SEPARATOR = /[\\/]+/;

function workspaceGlobOf(path: string): string | null {
  const root = path.split(PATH_SEPARATOR).find((segment) => segment.length > 0 && segment !== ".");
  return root === undefined || root.includes("*") ? null : `${root}/*`;
}

function workspaceGlobs(blueprint: Blueprint): readonly string[] {
  const fromComponents = blueprint.components.flatMap((component) => component.paths.flatMap((path) => workspaceGlobOf(path) ?? []));
  const fromContract = workspaceGlobOf(CONTRACT_DIR);
  return [...new Set([...fromComponents, ...(fromContract === null ? [] : [fromContract])])].sort();
}

function renderRootManifest(globs: readonly string[]): string {
  const manifest = { name: WORKSPACE_PACKAGE_NAME, private: true, type: "module", workspaces: globs };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function renderBaseTsconfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function buildWorkspaceFiles(blueprint: Blueprint, language: ContractLanguage): readonly ContractFile[] {
  const manifest = { path: WORKSPACE_MANIFEST_PATH, content: renderRootManifest(workspaceGlobs(blueprint)) };
  if (language !== "typescript") return [manifest];
  return [manifest, { path: WORKSPACE_TSCONFIG_PATH, content: renderBaseTsconfig() }];
}
