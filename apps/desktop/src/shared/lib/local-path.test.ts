import test from "node:test";
import assert from "node:assert/strict";
import { localFilePathOf } from "./local-path";

test("paths and known file names are recognised, with a line suffix dropped", () => {
  assert.equal(localFilePathOf("docs/uiupdate.md"), "docs/uiupdate.md");
  assert.equal(localFilePathOf("./src/app/App.tsx:1306"), "src/app/App.tsx");
  assert.equal(localFilePathOf("uiupdate.md"), "uiupdate.md");
  assert.equal(localFilePathOf("/home/user/weave/CLAUDE.md"), "/home/user/weave/CLAUDE.md");
});

test("identifiers, commands, folders, URLs and escapes are not file links", () => {
  for (const text of ["planAndRun", "onEvent", "Node.js", "1.2k", "features/runs/", "git status", "https://a.io/x.md", "../secret.md", "a/*.ts", "v2.1"]) {
    assert.equal(localFilePathOf(text), null, text);
  }
});
