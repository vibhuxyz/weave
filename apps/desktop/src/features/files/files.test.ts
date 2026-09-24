import test from "node:test";
import assert from "node:assert/strict";
import { isMarkdownPath, pathSegments } from "./path-parts";
import { useFileStore } from "./store";

test("a reply for a file that is no longer open is ignored", () => {
  const store = useFileStore.getState();
  store.open("docs/a.md");
  store.open("docs/b.md");
  useFileStore.getState().receive({ type: "file-content", path: "docs/a.md", content: "old", truncated: false });
  assert.deepEqual(useFileStore.getState().view, { status: "loading" });
  useFileStore.getState().receive({ type: "file-error", path: "docs/b.md", message: "Cannot open docs/b.md: no such file in this project." });
  assert.deepEqual(useFileStore.getState().view, { status: "error", message: "Cannot open docs/b.md: no such file in this project." });
  useFileStore.getState().close();
  assert.equal(useFileStore.getState().openPath, null);
});

test("the breadcrumb and renderer come from the path", () => {
  assert.deepEqual(pathSegments("docs/uiupdate.md"), ["docs", "uiupdate.md"]);
  assert.equal(isMarkdownPath("docs/uiupdate.md"), true);
  assert.equal(isMarkdownPath("src/app/App.tsx"), false);
});
