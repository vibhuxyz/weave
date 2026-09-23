import test from "node:test";
import assert from "node:assert/strict";
import { mergeDraftImages, mergeDraftText } from "./restore-draft.ts";

const photo = { previewUrl: "blob:a" };
const chart = { previewUrl: "blob:b" };

test("restores text into an empty composer", () => {
  assert.equal(mergeDraftText("", "fix the bug"), "fix the bug");
  assert.equal(mergeDraftText("  \n", "fix the bug"), "fix the bug");
});

test("keeps what the user typed during compaction, after the restored text", () => {
  assert.equal(mergeDraftText("also add tests", "fix the bug"), "fix the bug\n\nalso add tests");
});

test("restoring twice never duplicates text or images", () => {
  const onceText = mergeDraftText("", "fix the bug");
  assert.equal(mergeDraftText(onceText, "fix the bug"), "fix the bug");
  const onceImages = mergeDraftImages([], [photo]);
  assert.deepEqual(mergeDraftImages(onceImages, [photo]), [photo]);
});

test("image-only prompts restore images and leave text alone", () => {
  assert.equal(mergeDraftText("typed meanwhile", ""), "typed meanwhile");
  assert.deepEqual(mergeDraftImages([chart], [photo]), [photo, chart]);
});

test("text and images restore together", () => {
  assert.equal(mergeDraftText("", "describe these"), "describe these");
  assert.deepEqual(mergeDraftImages([], [photo, chart]), [photo, chart]);
});
