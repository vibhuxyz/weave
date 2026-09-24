import type { Blueprint } from "../blueprint/index.ts";
import { CONTRACT_ENTRY_PATHS, CONTRACT_PACKAGE_NAME, CONTRACT_PACKAGE_PATH } from "./constants.ts";
import { contractLanguageFor, renderContractEntry, type ContractLanguage } from "./render/index.ts";
import type { Contract } from "./types.ts";

function renderPackageJson(language: ContractLanguage): string {
  const entry = language === "typescript" ? "src/index.ts" : "src/index.js";
  const manifest = { name: CONTRACT_PACKAGE_NAME, private: true, type: "module", main: entry, types: entry };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildContract(blueprint: Blueprint, version: number): Contract {
  const language = contractLanguageFor(blueprint.stack);
  const entryPath = CONTRACT_ENTRY_PATHS[language];
  return {
    version,
    language,
    entryPath,
    files: [
      { path: CONTRACT_PACKAGE_PATH, content: renderPackageJson(language) },
      { path: entryPath, content: renderContractEntry(blueprint, version, language) },
    ],
    exports: [...blueprint.schemas.map((schema) => schema.name), "ENDPOINTS", "Events", "CONTRACT_VERSION"],
  };
}
