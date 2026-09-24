import test from "node:test";
import assert from "node:assert/strict";
import { describeDrift, findRedeclaredSymbols } from "./drift.ts";

const EXPORTS = ["Note", "ENDPOINTS", "Events", "CONTRACT_VERSION"];

test("the copy from the live greenfield run is caught", () => {
  const copied = [
    "export const CONTRACT_VERSION = 1;",
    "export const ENDPOINTS = { listNotes: { method: \"GET\", path: \"/notes\" } };",
    "/**\n * @typedef {object} Note\n * @property {string} id\n */",
  ].join("\n");
  assert.deepEqual(findRedeclaredSymbols([{ path: "src/contract.js", content: copied }], EXPORTS), [
    { path: "src/contract.js", symbols: ["Note", "ENDPOINTS", "CONTRACT_VERSION"] },
  ]);
});

test("TypeScript re-declarations are caught too", () => {
  const content = "interface Note { id: string }\ntype Events = Record<string, unknown>;";
  assert.deepEqual(findRedeclaredSymbols([{ path: "api/types.ts", content }], EXPORTS), [
    { path: "api/types.ts", symbols: ["Note", "Events"] },
  ]);
});

test("importing and using the contract is not drift, and the contract itself is ignored", () => {
  const importing = 'import { ENDPOINTS, CONTRACT_VERSION } from "../packages/contracts/src/index.js";\nconst notes = [];\nconst NoteList = [];';
  const contract = "export const ENDPOINTS = {};";
  assert.deepEqual(findRedeclaredSymbols([
    { path: "src/server.js", content: importing },
    { path: "packages/contracts/src/index.js", content: contract },
  ], EXPORTS), []);
});

test("the failure reason names the files, the symbols and the fix", () => {
  const reason = describeDrift([{ path: "src/contract.js", symbols: ["ENDPOINTS"] }], "packages/contracts/src/index.js");
  assert.equal(reason, "re-declares contract symbols locally: src/contract.js (ENDPOINTS). Import them from packages/contracts/src/index.js, or request a contract change");
});
