export const CONTRACT_DIR = "packages/contracts";
export const CONTRACT_GLOB = `${CONTRACT_DIR}/**`;
export const CONTRACT_ENTRY_PATHS = {
  typescript: `${CONTRACT_DIR}/src/index.ts`,
  javascript: `${CONTRACT_DIR}/src/index.js`,
} as const;
export const CONTRACT_PACKAGE_PATH = `${CONTRACT_DIR}/package.json`;
export const CONTRACT_PACKAGE_NAME = "contracts";

export const MAX_CHANGE_TEXT_CHARS = 500;
export const MAX_AFFECTED_SYMBOLS = 20;
export const MAX_SYMBOL_CHARS = 100;
export const MAX_SUMMARY_BYTES = 2048;
